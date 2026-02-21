//
//  UserDefaultsGroupKeys.swift
//  Ishmael
//
//  Created by Marcos Rodriguez on 4/14/24.
//  Copyright © 2024 Ishmael. All rights reserved.
//

import Foundation

enum UserDefaultsGroupKey: String {
  case GroupName = "group.io.hogusea.ishmael"
  case PreferredCurrency = "preferredCurrency"
  case WatchAppBundleIdentifier = "io.hogusea.ishmael.watch"
  case BundleIdentifier = "io.hogusea.ishmael"
  case ElectrumSettingsHost = "electrum_host"
  case ElectrumSettingsTCPPort = "electrum_tcp_port"
  case ElectrumSettingsSSLPort = "electrum_ssl_port"
  case AllWalletsBalance = "WidgetCommunicationAllWalletsSatoshiBalance"
  case AllWalletsLatestTransactionTime = "WidgetCommunicationAllWalletsLatestTransactionTime"
  case LatestTransactionIsUnconfirmed = "\"WidgetCommunicationLatestTransactionIsUnconfirmed\""
}
