#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE(MenuElementsEmitter, RCTEventEmitter)

RCT_EXTERN_METHOD(openSettings)
RCT_EXTERN_METHOD(addWalletMenuAction)
RCT_EXTERN_METHOD(importWalletMenuAction)
RCT_EXTERN_METHOD(reloadTransactionsMenuAction)
RCT_EXTERN_METHOD(startTorRuntime:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(stopTorRuntime:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(getTorRuntimeStatus:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)

@end
