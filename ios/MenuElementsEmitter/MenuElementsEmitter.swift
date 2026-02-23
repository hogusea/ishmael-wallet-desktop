import Foundation
import React
#if targetEnvironment(macCatalyst)
import Darwin
#endif

@objc(MenuElementsEmitter)
class MenuElementsEmitter: RCTEventEmitter {
    
    private static var instance: MenuElementsEmitter?
    private var hasListeners = false
    #if targetEnvironment(macCatalyst)
    private static let torRuntimeQueue = DispatchQueue(label: "io.hogusea.ishmael.tor.runtime")
    private static var torPid: pid_t = 0
    private static var torLastStartError: String? = nil
    #endif
    
    override init() {
        super.init()
        MenuElementsEmitter.instance = self
    }
    
    @objc
    class func sharedInstance() -> MenuElementsEmitter {
        if instance == nil {
            instance = MenuElementsEmitter()
        }
        return instance!
    }
    
    override func supportedEvents() -> [String]! {
        return ["openSettings", "addWalletMenuAction", "importWalletMenuAction", "reloadTransactionsMenuAction"]
    }
    
    override class func requiresMainQueueSetup() -> Bool {
        return true
    }
    
    override func startObserving() {
        hasListeners = true
    }
    
    override func stopObserving() {
        hasListeners = false
    }
    
    @objc
    func openSettings() {
        if hasListeners {
            sendEvent(withName: "openSettings", body: nil)
        }
    }
    
    @objc
    func addWalletMenuAction() {
        if hasListeners {
            sendEvent(withName: "addWalletMenuAction", body: nil)
        }
    }
    
    @objc
    func importWalletMenuAction() {
        if hasListeners {
            sendEvent(withName: "importWalletMenuAction", body: nil)
        }
    }
    
    @objc
    func reloadTransactionsMenuAction() {
        if hasListeners {
            sendEvent(withName: "reloadTransactionsMenuAction", body: nil)
        }
    }

    @objc
    func bootstrapTorRuntimeIfNeeded() {
        #if targetEnvironment(macCatalyst)
        let shouldEnableTor = UserDefaults.standard.string(forKey: "electrum_tor_enabled") == "1"
        setGlobalTorProxyEnabled(shouldEnableTor)

        guard shouldEnableTor else {
            return
        }

        startTorRuntime({ _ in
            print("[TorRuntime] Bootstrapped embedded Tor runtime from stored preference")
        }, rejecter: { code, message, _ in
            print("[TorRuntime] Bootstrap failed (\(code)): \(message ?? "unknown_error")")
            BWSetGlobalTorProxyEnabled(false)
        })
        #endif
    }

    @objc(startTorRuntime:rejecter:)
    func startTorRuntime(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        #if targetEnvironment(macCatalyst)
        MenuElementsEmitter.torRuntimeQueue.async {
            self.setGlobalTorProxyEnabled(true)
            self.reconcileTorProcessState()
            self.clearTorStartFailure()

            // If any SOCKS5 endpoint is already listening locally, reuse it.
            if self.isLocalPortOpen(9050) {
                resolve(true)
                return
            }

            let currentPid = MenuElementsEmitter.torPid
            if currentPid > 0 {
                if !self.isProcessRunning(currentPid) {
                    MenuElementsEmitter.torPid = 0
                } else {
                    // Runtime state looks inconsistent (pid exists but SOCKS not reachable). Restart cleanly.
                    self.terminateProcess(currentPid)
                    MenuElementsEmitter.torPid = 0
                }
            }

            guard let torBinaryURL = self.bundledTorBinaryURL() else {
                self.setGlobalTorProxyEnabled(false)
                self.recordTorStartFailure(code: "TOR_BINARY_MISSING", message: "Bundled Tor binary was not found.")
                reject("TOR_BINARY_MISSING", "Bundled Tor binary was not found.", nil)
                return
            }

            do {
                try self.ensureExecutablePermissions(for: torBinaryURL)
                let dataDirectory = try self.torDataDirectoryURL()
                self.removeStaleTorLockFile(in: dataDirectory)

                var arguments = [
                    "--ClientOnly", "1",
                    "--SocksPort", "127.0.0.1:9050",
                    "--DataDirectory", dataDirectory.path,
                    "--AvoidDiskWrites", "1",
                    "--CookieAuthentication", "0",
                    "--ControlPort", "0",
                    "--Log", "notice stderr"
                ]

                if let resourceDirectory = Bundle.main.resourceURL {
                    let geoip = resourceDirectory.appendingPathComponent("geoip")
                    let geoip6 = resourceDirectory.appendingPathComponent("geoip6")
                    if FileManager.default.fileExists(atPath: geoip.path) {
                        arguments.append(contentsOf: ["--GeoIPFile", geoip.path])
                    }
                    if FileManager.default.fileExists(atPath: geoip6.path) {
                        arguments.append(contentsOf: ["--GeoIPv6File", geoip6.path])
                    }
                }

                let pid = try self.spawnProcess(executablePath: torBinaryURL.path, arguments: arguments)
                MenuElementsEmitter.torPid = pid

                let deadline = Date().addingTimeInterval(12.0)
                while Date() < deadline {
                    if !self.isProcessRunning(pid) {
                        MenuElementsEmitter.torPid = 0
                        self.setGlobalTorProxyEnabled(false)
                        self.recordTorStartFailure(code: "TOR_EXITED_EARLY", message: "Tor process exited before opening SOCKS port.")
                        reject("TOR_EXITED_EARLY", "Tor process exited before opening SOCKS port.", nil)
                        return
                    }

                    if self.isLocalPortOpen(9050) {
                        self.clearTorStartFailure()
                        resolve(true)
                        return
                    }
                    usleep(200_000)
                }

                self.terminateProcess(pid)
                MenuElementsEmitter.torPid = 0
                self.setGlobalTorProxyEnabled(false)
                self.recordTorStartFailure(code: "TOR_START_TIMEOUT", message: "Tor did not open 127.0.0.1:9050 in time.")
                reject("TOR_START_TIMEOUT", "Tor did not open 127.0.0.1:9050 in time.", nil)
            } catch {
                MenuElementsEmitter.torPid = 0
                self.setGlobalTorProxyEnabled(false)
                self.recordTorStartFailure(code: "TOR_START_FAILED", message: error.localizedDescription)
                reject("TOR_START_FAILED", error.localizedDescription, error as NSError)
            }
        }
        #else
        resolve(false)
        #endif
    }

    @objc(stopTorRuntime:rejecter:)
    func stopTorRuntime(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        #if targetEnvironment(macCatalyst)
        MenuElementsEmitter.torRuntimeQueue.async {
            let pid = MenuElementsEmitter.torPid
            if pid > 0 {
                self.terminateProcess(pid)
            }

            MenuElementsEmitter.torPid = 0
            self.clearTorStartFailure()
            self.setGlobalTorProxyEnabled(false)
            resolve(true)
        }
        #else
        resolve(false)
        #endif
    }

    @objc(getTorRuntimeStatus:rejecter:)
    func getTorRuntimeStatus(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        #if targetEnvironment(macCatalyst)
        MenuElementsEmitter.torRuntimeQueue.async {
            self.reconcileTorProcessState()
            var status: [String: Any] = [
                "available": false,
                "running": false
            ]

            if let torBinaryURL = self.bundledTorBinaryURL() {
                status["available"] = true
                status["binaryPath"] = torBinaryURL.path
            } else {
                status["reason"] = "bundled_tor_binary_missing"
            }

            let pid = MenuElementsEmitter.torPid
            if pid > 0 && self.isProcessRunning(pid) {
                status["running"] = true
                status["pid"] = Int(pid)
            }
            status["proxyEnabled"] = self.isGlobalTorProxyEnabled()
            if status["running"] as? Bool != true, let lastError = MenuElementsEmitter.torLastStartError {
                if status["reason"] == nil {
                    status["reason"] = lastError
                }
                status["lastError"] = lastError
            }
            resolve(status)
        }
        #else
        resolve([
            "available": false,
            "running": false,
            "proxyEnabled": false,
            "reason": "platform_not_supported"
        ])
        #endif
    }

    #if targetEnvironment(macCatalyst)
    private func setGlobalTorProxyEnabled(_ enabled: Bool) {
        BWSetGlobalTorProxyEnabled(enabled)
    }

    private func isGlobalTorProxyEnabled() -> Bool {
        return BWIsGlobalTorProxyEnabled()
    }

    private func reconcileTorProcessState() {
        let pid = MenuElementsEmitter.torPid
        guard pid > 0 else { return }
        if !isProcessRunning(pid) {
            _ = reapIfExited(pid)
            MenuElementsEmitter.torPid = 0
        }
    }

    private func clearTorStartFailure() {
        MenuElementsEmitter.torLastStartError = nil
    }

    private func recordTorStartFailure(code: String, message: String) {
        MenuElementsEmitter.torLastStartError = "\(code): \(message)"
    }

    private func bundledTorBinaryURL() -> URL? {
        let fileManager = FileManager.default
        var candidates: [URL] = []

        if let executableURL = Bundle.main.executableURL {
            candidates.append(executableURL.deletingLastPathComponent().appendingPathComponent("tor"))
        }

        candidates.append(Bundle.main.bundleURL.appendingPathComponent("Contents/MacOS/tor"))

        for candidate in candidates {
            if fileManager.fileExists(atPath: candidate.path) {
                return candidate
            }
        }
        return nil
    }

    private func torDataDirectoryURL() throws -> URL {
        let appSupport = try FileManager.default.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        )
        let torDirectory = appSupport.appendingPathComponent("IshmaelTor", isDirectory: true)
        try FileManager.default.createDirectory(at: torDirectory, withIntermediateDirectories: true)
        return torDirectory
    }

    private func removeStaleTorLockFile(in directory: URL) {
        let lockFile = directory.appendingPathComponent("lock")
        guard FileManager.default.fileExists(atPath: lockFile.path) else { return }
        try? FileManager.default.removeItem(at: lockFile)
    }

    private func ensureExecutablePermissions(for fileURL: URL) throws {
        let fileManager = FileManager.default
        var attributes = try fileManager.attributesOfItem(atPath: fileURL.path)
        let currentPermissions = (attributes[.posixPermissions] as? NSNumber)?.intValue ?? 0
        if (currentPermissions & 0o111) == 0 {
            attributes[.posixPermissions] = NSNumber(value: 0o755)
            try fileManager.setAttributes(attributes, ofItemAtPath: fileURL.path)
        }
    }

    private func spawnProcess(executablePath: String, arguments: [String]) throws -> pid_t {
        var pid: pid_t = 0
        let argValues = [executablePath] + arguments
        var argv = argValues.map { strdup($0) }
        defer {
            for case let value? in argv {
                free(value)
            }
        }
        argv.append(nil)

        let spawnResult = executablePath.withCString { pathPointer -> Int32 in
            argv.withUnsafeMutableBufferPointer { argvBuffer in
                posix_spawn(&pid, pathPointer, nil, nil, argvBuffer.baseAddress, nil)
            }
        }

        if spawnResult != 0 {
            throw NSError(
                domain: "TorRuntime",
                code: Int(spawnResult),
                userInfo: [NSLocalizedDescriptionKey: "posix_spawn failed with code \(spawnResult)"]
            )
        }
        return pid
    }

    private func terminateProcess(_ pid: pid_t) {
        guard pid > 0 else { return }

        _ = kill(pid, SIGTERM)
        let softDeadline = Date().addingTimeInterval(3.0)
        while Date() < softDeadline {
            if !isProcessRunning(pid) {
                _ = reapIfExited(pid)
                return
            }
            usleep(100_000)
        }

        _ = kill(pid, SIGKILL)
        usleep(200_000)
        _ = reapIfExited(pid)
    }

    private func isProcessRunning(_ pid: pid_t) -> Bool {
        guard pid > 0 else { return false }
        if kill(pid, 0) == 0 {
            return true
        }

        let err = errno
        if err == EPERM {
            return true
        }

        if err == ESRCH {
            _ = reapIfExited(pid)
        }
        return false
    }

    @discardableResult
    private func reapIfExited(_ pid: pid_t) -> Bool {
        var status: Int32 = 0
        let waitedPid = waitpid(pid, &status, WNOHANG)
        return waitedPid == pid
    }

    private func isLocalPortOpen(_ port: UInt16) -> Bool {
        let socketFd = socket(AF_INET, SOCK_STREAM, 0)
        if socketFd < 0 {
            return false
        }

        defer {
            close(socketFd)
        }

        var timeout = timeval(tv_sec: 1, tv_usec: 0)
        withUnsafePointer(to: &timeout) { timeoutPointer in
            _ = setsockopt(
                socketFd,
                SOL_SOCKET,
                SO_SNDTIMEO,
                timeoutPointer,
                socklen_t(MemoryLayout<timeval>.size)
            )
            _ = setsockopt(
                socketFd,
                SOL_SOCKET,
                SO_RCVTIMEO,
                timeoutPointer,
                socklen_t(MemoryLayout<timeval>.size)
            )
        }

        var address = sockaddr_in()
        address.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
        address.sin_family = sa_family_t(AF_INET)
        address.sin_port = port.bigEndian
        address.sin_addr = in_addr(s_addr: inet_addr("127.0.0.1"))

        let result = withUnsafePointer(to: &address) { pointer in
            pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) { sockaddrPointer in
                connect(socketFd, sockaddrPointer, socklen_t(MemoryLayout<sockaddr_in>.size))
            }
        }

        return result == 0
    }
    #endif
}
