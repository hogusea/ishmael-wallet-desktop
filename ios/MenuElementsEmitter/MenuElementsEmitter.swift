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
    private static var torProcess: Process?
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
            NSLog("[TorRuntime] Bootstrapped embedded Tor runtime from stored preference")
        }, rejecter: { code, message, _ in
            NSLog("[TorRuntime] Bootstrap failed (%@): %@", code, message ?? "unknown_error")
            BWSetGlobalTorProxyEnabled(false)
        })
        #endif
    }

    @objc(startTorRuntime:rejecter:)
    func startTorRuntime(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        #if targetEnvironment(macCatalyst)
        DispatchQueue.global(qos: .utility).async {
            self.setGlobalTorProxyEnabled(true)

            if let process = MenuElementsEmitter.torProcess, process.isRunning {
                resolve(true)
                return
            }

            guard let torBinaryURL = self.bundledTorBinaryURL() else {
                self.setGlobalTorProxyEnabled(false)
                reject("TOR_BINARY_MISSING", "Bundled Tor binary was not found.", nil)
                return
            }

            do {
                try self.ensureExecutablePermissions(for: torBinaryURL)
                let dataDirectory = try self.torDataDirectoryURL()

                let process = Process()
                process.executableURL = torBinaryURL

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

                process.arguments = arguments

                let stdoutPipe = Pipe()
                let stderrPipe = Pipe()
                process.standardOutput = stdoutPipe
                process.standardError = stderrPipe

                process.terminationHandler = { _ in
                    MenuElementsEmitter.torProcess = nil
                }

                try process.run()

                MenuElementsEmitter.torProcess = process

                let deadline = Date().addingTimeInterval(12.0)
                while Date() < deadline {
                    if !process.isRunning {
                        self.setGlobalTorProxyEnabled(false)
                        reject("TOR_EXITED_EARLY", "Tor process exited before opening SOCKS port.", nil)
                        return
                    }

                    if self.isLocalPortOpen(9050) {
                        resolve(true)
                        return
                    }
                    usleep(200_000)
                }

                if process.isRunning {
                    process.terminate()
                }
                MenuElementsEmitter.torProcess = nil
                self.setGlobalTorProxyEnabled(false)
                reject("TOR_START_TIMEOUT", "Tor did not open 127.0.0.1:9050 in time.", nil)
            } catch {
                self.setGlobalTorProxyEnabled(false)
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
        DispatchQueue.global(qos: .utility).async {
            guard let process = MenuElementsEmitter.torProcess else {
                self.setGlobalTorProxyEnabled(false)
                resolve(true)
                return
            }

            if process.isRunning {
                process.terminate()
                let deadline = Date().addingTimeInterval(3.0)
                while process.isRunning && Date() < deadline {
                    usleep(100_000)
                }
                if process.isRunning {
                    process.interrupt()
                }
            }

            MenuElementsEmitter.torProcess = nil
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
        var status: [String: Any] = [
            "available": false,
            "running": false
        ]

        if let torBinaryURL = bundledTorBinaryURL() {
            status["available"] = true
            status["binaryPath"] = torBinaryURL.path
        } else {
            status["reason"] = "bundled_tor_binary_missing"
        }

        if let process = MenuElementsEmitter.torProcess, process.isRunning {
            status["running"] = true
            status["pid"] = Int(process.processIdentifier)
        }
        status["proxyEnabled"] = isGlobalTorProxyEnabled()

        resolve(status)
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

    private func ensureExecutablePermissions(for fileURL: URL) throws {
        let fileManager = FileManager.default
        var attributes = try fileManager.attributesOfItem(atPath: fileURL.path)
        let currentPermissions = (attributes[.posixPermissions] as? NSNumber)?.intValue ?? 0
        if (currentPermissions & 0o111) == 0 {
            attributes[.posixPermissions] = NSNumber(value: 0o755)
            try fileManager.setAttributes(attributes, ofItemAtPath: fileURL.path)
        }
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
