# Ishmael Wallet Desktop (BlueWallet-based)

Ishmael Wallet Desktop is a BlueWallet-based React Native app for macOS (Mac Catalyst), focused on watch-only + PSBT workflow.

## What This Repo Is
- BlueWallet codebase fork (React Native)
- Desktop target: macOS via Mac Catalyst
- Non-Electron architecture
- Watch-only import flow enabled for Ishmael

## Watch-Only Policy
- Import only: xpub / ypub / zpub or single address
- No mnemonic creation flow in the import UI
- No WIF import in the import UI
- Intended signing flow: export unsigned PSBT -> sign on external paper/offline signer -> import signed PSBT

## Run (macOS Catalyst)
1. Install dependencies
```bash
cd /Users/hogu/ishmael-wallet-desktop
npm install
npx pod-install
```

2. Start Metro
```bash
npm start
```

3. Run app from Xcode
- Open `ios/BlueWallet.xcworkspace`
- Select app scheme `ISHMAEL`
- Select destination `My Mac (Designed for iPad)`
- Run

## Optional iOS Run
```bash
npx react-native run-ios
```

## Notes
- This repository is reset and rebuilt from BlueWallet-based source.
- If macOS camera permission blocks QR scan, allow camera access in System Settings.

## License
MIT
