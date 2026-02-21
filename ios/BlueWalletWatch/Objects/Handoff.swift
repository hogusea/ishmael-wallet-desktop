//
//  Handoff.swift
//  IshmaelWatch Extension
//
//  Created by Admin on 9/27/21.
//  Copyright © 2021 Ishmael. All rights reserved.
//

import Foundation

enum HandoffIdentifier: String {
  case ReceiveOnchain = "io.hogusea.ishmael.receiveonchain"
  case Xpub = "io.hogusea.ishmael.xpub"
  case ViewInBlockExplorer = "io.hogusea.ishmael.blockexplorer"
}

enum HandOffUserInfoKey: String {
  case ReceiveOnchain = "address"
  case Xpub = "xpub"
}

enum HandOffTitle: String {
  case ReceiveOnchain = "View Address"
  case Xpub = "View XPUB"
}
