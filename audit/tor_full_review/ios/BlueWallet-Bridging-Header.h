//
//  Ishmael-Bridging-Header.h
//  Ishmael
//
//  Created by Marcos Rodriguez on 4/4/25.
//  Copyright © 2025 Ishmael. All rights reserved.
//

#import <RNCPushNotificationIOS.h>
#import "RNQuickActionManager.h"

void BWInstallGlobalTorProxyConfigurationProvider(void);
void BWSetGlobalTorProxyEnabled(BOOL enabled);
BOOL BWIsGlobalTorProxyEnabled(void);
