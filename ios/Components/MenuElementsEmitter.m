#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>
#import <React/RCTHTTPRequestHandler.h>
#import <CFNetwork/CFNetwork.h>
#import <objc/runtime.h>

static BOOL BWGlobalTorProxyEnabled = NO;

static dispatch_queue_t BWGlobalTorProxyStateQueue(void) {
  static dispatch_queue_t queue;
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{
    queue = dispatch_queue_create("io.hogusea.ishmael.torproxy.state", DISPATCH_QUEUE_SERIAL);
  });
  return queue;
}

BOOL BWIsGlobalTorProxyEnabled(void) {
  __block BOOL enabled = NO;
  dispatch_sync(BWGlobalTorProxyStateQueue(), ^{
    enabled = BWGlobalTorProxyEnabled;
  });
  return enabled;
}

void BWSetGlobalTorProxyEnabled(BOOL enabled) {
  dispatch_sync(BWGlobalTorProxyStateQueue(), ^{
    BWGlobalTorProxyEnabled = enabled;
  });
}

static NSDictionary *BWGlobalTorProxyDictionary(void) {
  return @{
    (NSString *)kCFNetworkProxiesSOCKSEnable : @YES,
    (NSString *)kCFNetworkProxiesSOCKSProxy : @"127.0.0.1",
    (NSString *)kCFNetworkProxiesSOCKSPort : @9050,
  };
}

static void BWApplyGlobalTorProxyToConfiguration(NSURLSessionConfiguration *configuration) {
  if (!configuration) return;

  if (BWIsGlobalTorProxyEnabled()) {
    configuration.connectionProxyDictionary = BWGlobalTorProxyDictionary();
  } else {
    configuration.connectionProxyDictionary = nil;
  }
}

@interface NSURLSessionConfiguration (BWGlobalTorProxy)
+ (NSURLSessionConfiguration *)bw_tor_defaultSessionConfiguration;
+ (NSURLSessionConfiguration *)bw_tor_ephemeralSessionConfiguration;
@end

@implementation NSURLSessionConfiguration (BWGlobalTorProxy)
+ (NSURLSessionConfiguration *)bw_tor_defaultSessionConfiguration {
  NSURLSessionConfiguration *configuration = [self bw_tor_defaultSessionConfiguration];
  BWApplyGlobalTorProxyToConfiguration(configuration);
  return configuration;
}

+ (NSURLSessionConfiguration *)bw_tor_ephemeralSessionConfiguration {
  NSURLSessionConfiguration *configuration = [self bw_tor_ephemeralSessionConfiguration];
  BWApplyGlobalTorProxyToConfiguration(configuration);
  return configuration;
}
@end

static void BWSwizzleClassMethod(Class klass, SEL originalSelector, SEL swizzledSelector) {
  Method originalMethod = class_getClassMethod(klass, originalSelector);
  Method swizzledMethod = class_getClassMethod(klass, swizzledSelector);
  if (!originalMethod || !swizzledMethod) return;
  method_exchangeImplementations(originalMethod, swizzledMethod);
}

void BWInstallGlobalTorProxyConfigurationProvider(void) {
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{
    RCTSetCustomNSURLSessionConfigurationProvider(^NSURLSessionConfiguration * {
      NSURLSessionConfiguration *configuration = [NSURLSessionConfiguration defaultSessionConfiguration];
      BWApplyGlobalTorProxyToConfiguration(configuration);
      return configuration;
    });

    BWSwizzleClassMethod([NSURLSessionConfiguration class], @selector(defaultSessionConfiguration), @selector(bw_tor_defaultSessionConfiguration));
    BWSwizzleClassMethod([NSURLSessionConfiguration class], @selector(ephemeralSessionConfiguration), @selector(bw_tor_ephemeralSessionConfiguration));
  });
}

// This macro exposes the Swift class to Objective-C 
@interface RCT_EXTERN_MODULE(MenuElementsEmitter, RCTEventEmitter)

// Expose the Swift method to JS
RCT_EXTERN_METHOD(openSettings)
RCT_EXTERN_METHOD(addWalletMenuAction)
RCT_EXTERN_METHOD(importWalletMenuAction)
RCT_EXTERN_METHOD(reloadTransactionsMenuAction)
RCT_EXTERN_METHOD(startTorRuntime:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(stopTorRuntime:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(getTorRuntimeStatus:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)

// Make sure we share the same instance between native UI and JS
+ (BOOL)requiresMainQueueSetup {
  return YES;
}

@end
