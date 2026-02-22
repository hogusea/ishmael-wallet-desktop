import BigNumber from 'bignumber.js';
import * as bitcoin from 'bitcoinjs-lib';
import DefaultPreference from 'react-native-default-preference';
import RNFS from 'react-native-fs';
import Realm from 'realm';
import { sha256 as _sha256 } from '@noble/hashes/sha256';
import { Buffer } from 'buffer';

import { LegacyWallet, SegwitBech32Wallet, SegwitP2SHWallet, TaprootWallet } from '../class';
import presentAlert from '../components/Alert';
import loc from '../loc';
import { GROUP_IO_BLUEWALLET } from './currency';
import { ElectrumServerItem } from '../screen/settings/ElectrumSettings';
import { triggerWarningHapticFeedback } from './hapticFeedback';
import { AlertButton, NativeModules } from 'react-native';
import { uint8ArrayToHex, stringToUint8Array, hexToUint8Array } from './uint8array-extras/index';
import * as TorRuntime from './TorRuntime';

const ElectrumClient = require('electrum-client');
const net = require('net');
const tls = require('tls');

type Utxo = {
  height: number;
  value: number;
  address: string;
  txid: string;
  vout: number;
  wif?: string;
};

type ElectrumTransaction = {
  txid: string;
  hash: string;
  version: number;
  size: number;
  vsize: number;
  weight: number;
  locktime: number;
  vin: {
    txid: string;
    vout: number;
    scriptSig: { asm: string; hex: string };
    txinwitness: string[];
    sequence: number;
    addresses?: string[];
    value?: number;
  }[];
  vout: {
    value: number;
    n: number;
    scriptPubKey: {
      asm: string;
      hex: string;
      reqSigs: number;
      type: string;
      addresses: string[];
    };
  }[];
  blockhash: string;
  confirmations: number;
  time: number;
  blocktime: number;
};

type ElectrumTransactionWithHex = ElectrumTransaction & {
  hex: string;
};

type MempoolTransaction = {
  height: 0;
  tx_hash: string;
  fee: number;
};

type Peer = {
  host: string;
  ssl?: number;
  tcp?: number;
};

export const ELECTRUM_HOST = 'electrum_host';
export const ELECTRUM_TCP_PORT = 'electrum_tcp_port';
export const ELECTRUM_SSL_PORT = 'electrum_ssl_port';
export const ELECTRUM_SERVER_HISTORY = 'electrum_server_history';
export const ELECTRUM_TOR_ENABLED = 'electrum_tor_enabled';
const ELECTRUM_CONNECTION_DISABLED = 'electrum_disabled';
const TOR_PROXY_HOST = '127.0.0.1';
const TOR_PROXY_PORT = 9050;
const SOCKS5_VERSION = 0x05;
const SOCKS5_CONNECT_COMMAND = 0x01;
const SOCKS5_AUTH_NONE = 0x00;
const SOCKS5_ADDRESS_TYPE_DOMAIN = 0x03;
const storageKey = 'ELECTRUM_PEERS';
const defaultPeer = { host: 'wallet.mobick.info', ssl: 40009 };
export const hardcodedPeers: Peer[] = [{ host: 'wallet.mobick.info', ssl: 40009 }];

export const suggestedServers: Peer[] = hardcodedPeers.map(peer => ({
  ...peer,
}));

let mainClient: typeof ElectrumClient | undefined;
let mainConnected: boolean = false;
let wasConnectedAtLeastOnce: boolean = false;
let serverName: string | false = false;
let disableBatching: boolean = false;
let connectionAttempt: number = 0;
let currentPeerIndex = Math.floor(Math.random() * hardcodedPeers.length);
let latestBlock: { height: number; time: number } | { height: undefined; time: undefined } = { height: undefined, time: undefined };
const txhashHeightCache: Record<string, number> = {};
let _realm: Realm | undefined;
const tcpSocketsNative = NativeModules?.TcpSockets as
  | {
      startTLS?: (socketId: number, options: Record<string, unknown>) => void;
    }
  | undefined;

type SocketConnectOptions = {
  port: number;
  host?: string;
  localAddress?: string;
  localPort?: number;
  interface?: string;
  reuseAddress?: boolean;
};

class TorProxySocket extends net.Socket {
  private pendingEncoding?: string;
  private targetHost = '';
  private targetPort = 0;
  private handshakeState: 'idle' | 'greeting' | 'connect_request' | 'connected' | 'failed' = 'idle';
  private handshakeBuffer: Buffer = Buffer.alloc(0);
  private tlsEnabled = false;
  private tlsOptions: Record<string, unknown> = {};

  enableTorTls(options: Record<string, unknown> = {}) {
    this.tlsEnabled = true;
    this.tlsOptions = options;
    return this;
  }

  setEncoding(encoding?: string) {
    if (this.handshakeState === 'greeting' || this.handshakeState === 'connect_request') {
      this.pendingEncoding = encoding;
      return this;
    }
    return super.setEncoding(encoding);
  }

  connect(options: SocketConnectOptions, callback?: () => void) {
    this.targetHost = options.host || 'localhost';
    this.targetPort = Number(options.port) || 0;
    this.handshakeState = 'greeting';
    this.handshakeBuffer = Buffer.alloc(0);
    const proxyOptions = {
      ...options,
      host: TOR_PROXY_HOST,
      port: TOR_PROXY_PORT,
    };
    return super.connect(proxyOptions, callback);
  }

  emit(eventName: string, ...args: any[]) {
    if (eventName === 'connect' && this.handshakeState === 'greeting') {
      const handshakeStart = Buffer.from([SOCKS5_VERSION, 0x01, SOCKS5_AUTH_NONE]);
      this.write(handshakeStart);
      return true;
    }

    if (eventName === 'data' && (this.handshakeState === 'greeting' || this.handshakeState === 'connect_request')) {
      const data = args[0];
      const chunk = Buffer.isBuffer(data) ? data : Buffer.from(data as string, 'latin1');
      this.handleSocksData(chunk);
      return true;
    }

    return super.emit(eventName, ...args);
  }

  private handleSocksData(chunk: Buffer) {
    this.handshakeBuffer = Buffer.concat([this.handshakeBuffer, chunk]);

    if (this.handshakeState === 'greeting') {
      if (this.handshakeBuffer.length < 2) return;
      const version = this.handshakeBuffer[0];
      const method = this.handshakeBuffer[1];
      this.handshakeBuffer = this.handshakeBuffer.slice(2);

      if (version !== SOCKS5_VERSION || method !== SOCKS5_AUTH_NONE) {
        this.failSocksHandshake('SOCKS5 authentication negotiation failed');
        return;
      }

      const hostBuffer = Buffer.from(this.targetHost, 'utf8');
      if (!hostBuffer.length || hostBuffer.length > 255) {
        this.failSocksHandshake('Invalid SOCKS5 destination host');
        return;
      }
      const upperPortByte = Math.floor(this.targetPort / 256) % 256;
      const lowerPortByte = this.targetPort % 256;

      const requestBuffer = Buffer.concat([
        Buffer.from([SOCKS5_VERSION, SOCKS5_CONNECT_COMMAND, 0x00, SOCKS5_ADDRESS_TYPE_DOMAIN, hostBuffer.length]),
        hostBuffer,
        Buffer.from([upperPortByte, lowerPortByte]),
      ]);

      this.handshakeState = 'connect_request';
      this.write(requestBuffer);
    }

    if (this.handshakeState === 'connect_request') {
      if (this.handshakeBuffer.length < 5) return;

      const version = this.handshakeBuffer[0];
      const replyCode = this.handshakeBuffer[1];
      const addressType = this.handshakeBuffer[3];

      if (version !== SOCKS5_VERSION) {
        this.failSocksHandshake('Invalid SOCKS5 response version');
        return;
      }

      if (replyCode !== 0x00) {
        this.failSocksHandshake(`SOCKS5 connect failed with code ${replyCode}`);
        return;
      }

      let addressLength: number | undefined;
      if (addressType === 0x01) {
        addressLength = 4;
      } else if (addressType === 0x04) {
        addressLength = 16;
      } else if (addressType === 0x03) {
        if (this.handshakeBuffer.length < 5) return;
        addressLength = this.handshakeBuffer[4] + 1;
      } else {
        this.failSocksHandshake('Unknown SOCKS5 address type');
        return;
      }

      const responseLength = 4 + addressLength + 2;
      if (this.handshakeBuffer.length < responseLength) return;

      this.handshakeBuffer = this.handshakeBuffer.slice(responseLength);
      this.completeSocksHandshake();
    }
  }

  private completeSocksHandshake() {
    this.handshakeState = 'connected';

    if (this.tlsEnabled) {
      if (!tcpSocketsNative?.startTLS) {
        this.failSocksHandshake('TLS over SOCKS5 is not supported on this build');
        return;
      }
      tcpSocketsNative.startTLS(this._id, this.tlsOptions);
    }

    const encodingToUse = this.pendingEncoding;
    if (encodingToUse) {
      super.setEncoding(encodingToUse);
    }
    this.pendingEncoding = undefined;

    super.emit('connect');

    if (this.handshakeBuffer.length > 0) {
      const remainder = this.handshakeBuffer;
      this.handshakeBuffer = Buffer.alloc(0);
      super.emit('data', encodingToUse ? remainder.toString(encodingToUse as any) : remainder);
    }
  }

  private failSocksHandshake(message: string) {
    this.handshakeState = 'failed';
    super.emit('error', new Error(message));
    this.destroy();
  }
}

class TorTlsSocket {
  constructor(socket: TorProxySocket, options: Record<string, unknown> = {}) {
    socket.enableTorTls(options);
    return socket;
  }
}

const torNet = { Socket: TorProxySocket };
const torTls = { TLSSocket: TorTlsSocket };

function bitcoinjs_crypto_sha256(buffer: Uint8Array): Uint8Array {
  return _sha256(buffer);
}

async function _getRealm() {
  if (_realm) return _realm;

  const cacheFolderPath = RNFS.CachesDirectoryPath; // Path to cache folder
  const password = uint8ArrayToHex(bitcoinjs_crypto_sha256(stringToUint8Array('fyegjitkyf[eqjnc.lf')));
  const buf = hexToUint8Array(password + password);
  const encryptionKey = Int8Array.from(buf);
  const path = `${cacheFolderPath}/electrumcache.realm`; // Use cache folder path

  const schema = [
    {
      name: 'Cache',
      primaryKey: 'cache_key',
      properties: {
        cache_key: { type: 'string', indexed: true },
        cache_value: 'string', // stringified json
      },
    },
  ];

  // @ts-ignore schema doesn't match Realm's schema type
  _realm = await Realm.open({
    schema,
    path,
    encryptionKey,
    excludeFromIcloudBackup: true,
  });

  return _realm;
}

export const getPreferredServer = async (): Promise<ElectrumServerItem | undefined> => {
  try {
    await DefaultPreference.setName(GROUP_IO_BLUEWALLET);
    const host = (await DefaultPreference.get(ELECTRUM_HOST)) as string;
    const tcpPort = await DefaultPreference.get(ELECTRUM_TCP_PORT);
    const sslPort = await DefaultPreference.get(ELECTRUM_SSL_PORT);

    console.log('Getting preferred server:', { host, tcpPort, sslPort });

    if (!host) {
      console.warn('Preferred server host is undefined');
      return;
    }

    return {
      host,
      tcp: tcpPort ? Number(tcpPort) : undefined,
      ssl: sslPort ? Number(sslPort) : undefined,
    };
  } catch (error) {
    console.error('Error in getPreferredServer:', error);
    return undefined;
  }
};

export const removePreferredServer = async () => {
  try {
    await DefaultPreference.setName(GROUP_IO_BLUEWALLET);
    console.log('Removing preferred server');
    await DefaultPreference.clear(ELECTRUM_HOST);
    await DefaultPreference.clear(ELECTRUM_TCP_PORT);
    await DefaultPreference.clear(ELECTRUM_SSL_PORT);
  } catch (error) {
    console.error('Error in removePreferredServer:', error);
  }
};

export async function isDisabled(): Promise<boolean> {
  let result;
  try {
    await DefaultPreference.setName(GROUP_IO_BLUEWALLET);
    const savedValue = await DefaultPreference.get(ELECTRUM_CONNECTION_DISABLED);
    console.log('Getting Electrum connection disabled state:', savedValue);
    if (savedValue === null) {
      result = false;
    } else {
      result = savedValue;
    }
  } catch (error) {
    console.error('Error getting Electrum connection disabled state:', error);
    result = false;
  }
  return !!result;
}

export async function setDisabled(disabled = true) {
  await DefaultPreference.setName(GROUP_IO_BLUEWALLET);
  console.log('Setting Electrum connection disabled state to:', disabled);
  return DefaultPreference.set(ELECTRUM_CONNECTION_DISABLED, disabled ? '1' : '');
}

export async function isTorEnabled(): Promise<boolean> {
  try {
    await DefaultPreference.setName(GROUP_IO_BLUEWALLET);
    const savedValue = await DefaultPreference.get(ELECTRUM_TOR_ENABLED);
    return savedValue === '1';
  } catch (error) {
    console.error('Error getting Tor mode state:', error);
    return false;
  }
}

export async function setTorEnabled(enabled = true) {
  await DefaultPreference.setName(GROUP_IO_BLUEWALLET);
  console.log('Setting Tor mode state to:', enabled);

  // On macOS Catalyst builds, start/stop embedded Tor runtime behind the same toggle.
  const runtimeStatus = await TorRuntime.getStatus();
  if (runtimeStatus.available) {
    if (enabled) {
      const started = runtimeStatus.running ? true : await TorRuntime.start();
      if (!started) {
        throw new Error('Failed to start embedded Tor runtime');
      }
    } else if (runtimeStatus.running) {
      await TorRuntime.stop();
    }
  }

  return DefaultPreference.set(ELECTRUM_TOR_ENABLED, enabled ? '1' : '');
}

async function getElectrumNetworkModules() {
  if (await isTorEnabled()) {
    return { net: torNet, tls: torTls };
  }
  return { net, tls };
}

function getCurrentPeer() {
  return hardcodedPeers[currentPeerIndex];
}

/**
 * Returns NEXT hardcoded electrum server (increments index after use)
 */
function getNextPeer() {
  const peer = getCurrentPeer();
  currentPeerIndex++;
  if (currentPeerIndex + 1 >= hardcodedPeers.length) currentPeerIndex = 0;
  return peer;
}

async function getSavedPeer(): Promise<Peer | null> {
  try {
    await DefaultPreference.setName(GROUP_IO_BLUEWALLET);
    const host = (await DefaultPreference.get(ELECTRUM_HOST)) as string;
    const tcpPort = await DefaultPreference.get(ELECTRUM_TCP_PORT);
    const sslPort = await DefaultPreference.get(ELECTRUM_SSL_PORT);

    console.log('Getting saved peer:', { host, tcpPort, sslPort });

    if (!host) {
      return null;
    }

    // wallet.mobick.info:40009 is TLS-only. Migrate legacy TCP setting automatically.
    if (host === 'wallet.mobick.info' && Number(tcpPort) === 40009 && !sslPort) {
      await DefaultPreference.set(ELECTRUM_SSL_PORT, '40009');
      await DefaultPreference.clear(ELECTRUM_TCP_PORT);
      return { host, ssl: 40009 };
    }

    if (sslPort) {
      return { host, ssl: Number(sslPort) };
    }

    if (tcpPort) {
      return { host, tcp: Number(tcpPort) };
    }

    return null;
  } catch (error) {
    console.error('Error in getSavedPeer:', error);
    return null;
  }
}

export async function connectMain(): Promise<void> {
  if (await isDisabled()) {
    console.log('Electrum connection disabled by user. Skipping connectMain call');
    return;
  }

  if (await isTorEnabled()) {
    const runtimeStatus = await TorRuntime.getStatus();
    if (runtimeStatus.available && !runtimeStatus.running) {
      const started = await TorRuntime.start();
      if (!started) {
        console.warn('Embedded Tor runtime was unavailable. Falling back to external local SOCKS proxy if present.');
      }
    }
  }

  let usingPeer = getNextPeer();
  const savedPeer = await getSavedPeer();
  if (savedPeer && savedPeer.host && (savedPeer.tcp || savedPeer.ssl)) {
    usingPeer = savedPeer;
  }

  console.log('Using peer:', JSON.stringify(usingPeer));

  try {
    console.log('begin connection:', JSON.stringify(usingPeer));
    const networkModules = await getElectrumNetworkModules();
    mainClient = new ElectrumClient(
      networkModules.net,
      networkModules.tls,
      usingPeer.ssl || usingPeer.tcp,
      usingPeer.host,
      usingPeer.ssl ? 'tls' : 'tcp',
    );

    mainClient.onError = function (e: { message: string }) {
      console.log('electrum mainClient.onError():', e.message);
      if (mainConnected) {
        // most likely got a timeout from electrum ping. lets reconnect
        // but only if we were previously connected (mainConnected), otherwise theres other
        // code which does connection retries
        mainClient?.close();
        mainClient = undefined;
        mainConnected = false;
        // dropping `mainConnected` flag ensures there wont be reconnection race condition if several
        // errors triggered
        console.log('reconnecting after socket error');
        setTimeout(connectMain, usingPeer.host.endsWith('.onion') ? 4000 : 500);
      }
    };
    const ver = await mainClient.initElectrum({ client: 'ishmael', version: '1.4' });
    if (ver && ver[0]) {
      console.log('connected to ', ver);
      serverName = ver[0];
      mainConnected = true;
      wasConnectedAtLeastOnce = true;
      if (ver[0].startsWith('ElectrumPersonalServer') || ver[0].startsWith('electrs') || ver[0].startsWith('Fulcrum')) {
        disableBatching = true;

        // exeptions for versions:
        const [electrumImplementation, electrumVersion] = ver[0].split(' ');
        switch (electrumImplementation) {
          case 'electrs':
            if (semVerToInt(electrumVersion) >= semVerToInt('0.9.0')) {
              disableBatching = false;
            }
            break;
          case 'electrs-esplora':
            // its a different one, and it does NOT support batching
            // nop
            break;
          case 'Fulcrum':
            if (semVerToInt(electrumVersion) >= semVerToInt('1.9.0')) {
              disableBatching = false;
            }
            break;
        }
      }
      const header = await mainClient.blockchainHeaders_subscribe();
      if (header && header.height) {
        latestBlock = {
          height: header.height,
          time: Math.floor(+new Date() / 1000),
        };
      }
      // AsyncStorage.setItem(storageKey, JSON.stringify(peers));  TODO: refactor
    }
  } catch (e) {
    mainConnected = false;
    console.log('bad connection:', JSON.stringify(usingPeer), e);
    mainClient?.close();
    mainClient = undefined;
  }

  if (!mainConnected) {
    console.log('retry');
    connectionAttempt = connectionAttempt + 1;
    mainClient?.close();
    mainClient = undefined;
    if (connectionAttempt >= 5) {
      presentNetworkErrorAlert(usingPeer);
    } else {
      console.log('reconnection attempt #', connectionAttempt);
      await new Promise(resolve => setTimeout(resolve, 500)); // sleep
      return connectMain();
    }
  }
}

export async function presentResetToDefaultsAlert(): Promise<boolean> {
  const hasPreferredServer = await getPreferredServer();
  const serverHistoryStr = await DefaultPreference.get(ELECTRUM_SERVER_HISTORY);
  const serverHistory = typeof serverHistoryStr === 'string' ? JSON.parse(serverHistoryStr) : [];
  return new Promise(resolve => {
    triggerWarningHapticFeedback();

    const buttons: AlertButton[] = [];

    if (hasPreferredServer?.host && (hasPreferredServer.tcp || hasPreferredServer.ssl)) {
      buttons.push({
        text: loc.settings.electrum_reset,
        onPress: async () => {
          try {
            await DefaultPreference.setName(GROUP_IO_BLUEWALLET);
            await DefaultPreference.clear(ELECTRUM_HOST);
            await DefaultPreference.clear(ELECTRUM_SSL_PORT);
            await DefaultPreference.clear(ELECTRUM_TCP_PORT);
          } catch (e) {
            console.log(e); // Must be running on Android
          }
          resolve(true);
        },
        style: 'default',
      });
    }

    if (serverHistory.length > 0) {
      buttons.push({
        text: loc.settings.electrum_reset_to_default_and_clear_history,
        onPress: async () => {
          try {
            await DefaultPreference.setName(GROUP_IO_BLUEWALLET);
            await DefaultPreference.clear(ELECTRUM_SERVER_HISTORY);
            await DefaultPreference.clear(ELECTRUM_HOST);
            await DefaultPreference.clear(ELECTRUM_SSL_PORT);
            await DefaultPreference.clear(ELECTRUM_TCP_PORT);
          } catch (e) {
            console.log(e); // Must be running on Android
          }
          resolve(true);
        },
        style: 'destructive',
      });
    }

    buttons.push({
      text: loc._.cancel,
      onPress: () => resolve(false),
      style: 'cancel',
    });

    presentAlert({
      title: loc.settings.electrum_reset,
      message: loc.settings.electrum_reset_to_default,
      buttons,
      options: { cancelable: true },
    });
  });
}

const presentNetworkErrorAlert = async (usingPeer?: Peer) => {
  if (await isDisabled()) {
    console.log(
      'Electrum connection disabled by user. Perhaps we are attempting to show this network error alert after the user disabled connections.',
    );
    return;
  }

  presentAlert({
    allowRepeat: false,
    title: loc.errors.network,
    message: loc.formatString(
      usingPeer ? loc.settings.electrum_unable_to_connect : loc.settings.electrum_error_connect,
      usingPeer ? { server: `${usingPeer.host}:${usingPeer.ssl ?? usingPeer.tcp}` } : {},
    ),
    buttons: [
      {
        text: loc.wallets.list_tryagain,
        onPress: () => {
          connectionAttempt = 0;
          mainClient?.close();
          mainClient = undefined;
          setTimeout(connectMain, 500);
        },
        style: 'default',
      },
      {
        text: loc.settings.electrum_reset,
        onPress: () => {
          presentResetToDefaultsAlert().then(result => {
            if (result) {
              connectionAttempt = 0;
              mainClient?.close();
              mainClient = undefined;
              setTimeout(connectMain, 500);
            }
          });
        },
        style: 'destructive',
      },
      {
        text: loc._.cancel,
        onPress: () => {
          connectionAttempt = 0;
          mainClient?.close();
          mainClient = undefined;
        },
        style: 'cancel',
      },
    ],
    options: { cancelable: false },
  });
};

/**
 * Returns random electrum server out of list of servers
 * previous electrum server told us. Nearly half of them is
 * usually offline.
 * Not used for now.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function getRandomDynamicPeer(): Promise<Peer> {
  try {
    let peers = JSON.parse((await DefaultPreference.get(storageKey)) as string);
    peers = peers.sort(() => Math.random() - 0.5); // shuffle
    for (const peer of peers) {
      const ret: Peer = { host: peer[0], ssl: peer[1] };
      ret.host = peer[1];

      if (peer[1] === 's') {
        ret.ssl = peer[2];
      } else {
        ret.tcp = peer[2];
      }

      for (const item of peer[2]) {
        if (item.startsWith('t')) {
          ret.tcp = item.replace('t', '');
        }
      }
      if (ret.host && ret.tcp) return ret;
    }

    return defaultPeer; // failed to find random client, using default
  } catch (_) {
    return defaultPeer; // smth went wrong, using default
  }
}

export const getBalanceByAddress = async function (address: string): Promise<{ confirmed: number; unconfirmed: number }> {
  try {
    if (!mainClient) throw new Error('Electrum client is not connected');
    const script = bitcoin.address.toOutputScript(address);
    const hash = bitcoinjs_crypto_sha256(script);
    const reversedHash = new Uint8Array(hash).reverse();
    const balance = await mainClient.blockchainScripthash_getBalance(uint8ArrayToHex(reversedHash));
    balance.addr = address;
    return balance;
  } catch (error) {
    console.error('Error in getBalanceByAddress:', error);
    throw error;
  }
};

export const getConfig = async function () {
  if (!mainClient) throw new Error('Electrum client is not connected');
  return {
    host: mainClient.host,
    port: mainClient.port,
    serverName,
    connected: mainClient.timeLastCall !== 0 && mainClient.status,
  };
};

export const getSecondsSinceLastRequest = function () {
  return mainClient && mainClient.timeLastCall ? (+new Date() - mainClient.timeLastCall) / 1000 : -1;
};

export const getTransactionsByAddress = async function (address: string): Promise<ElectrumHistory[]> {
  if (!mainClient) throw new Error('Electrum client is not connected');
  const script = bitcoin.address.toOutputScript(address);
  const hash = bitcoinjs_crypto_sha256(script);
  const reversedHash = new Uint8Array(hash).reverse();
  const history = await mainClient.blockchainScripthash_getHistory(uint8ArrayToHex(reversedHash));
  for (const h of history || []) {
    if (h.tx_hash) txhashHeightCache[h.tx_hash] = h.height; // cache tx height
  }

  return history;
};

export const getMempoolTransactionsByAddress = async function (address: string): Promise<MempoolTransaction[]> {
  if (!mainClient) throw new Error('Electrum client is not connected');
  const script = bitcoin.address.toOutputScript(address);
  const hash = bitcoinjs_crypto_sha256(script);
  const reversedHash = new Uint8Array(hash).reverse();
  return mainClient.blockchainScripthash_getMempool(uint8ArrayToHex(reversedHash));
};

export const ping = async function () {
  try {
    await mainClient.server_ping();
    return true;
  } catch (_) {}

  mainConnected = false;
  return false;
};

// exported only to be used in unit tests
export function txhexToElectrumTransaction(txhex: string): ElectrumTransactionWithHex {
  const tx = bitcoin.Transaction.fromHex(txhex);

  const ret: ElectrumTransactionWithHex = {
    txid: tx.getId(),
    hash: tx.getId(),
    version: tx.version,
    size: Math.ceil(txhex.length / 2),
    vsize: tx.virtualSize(),
    weight: tx.weight(),
    locktime: tx.locktime,
    vin: [],
    vout: [],
    hex: txhex,
    blockhash: '',
    confirmations: 0,
    time: 0,
    blocktime: 0,
  };

  if (txhashHeightCache[ret.txid]) {
    // got blockheight where this tx was confirmed
    ret.confirmations = estimateCurrentBlockheight() - txhashHeightCache[ret.txid];
    if (ret.confirmations < 0) {
      // ugly fix for when estimator lags behind
      ret.confirmations = 1;
    }
    ret.time = calculateBlockTime(txhashHeightCache[ret.txid]);
    ret.blocktime = calculateBlockTime(txhashHeightCache[ret.txid]);
  }

  for (const inn of tx.ins) {
    const txinwitness = [];
    if (inn.witness[0]) txinwitness.push(uint8ArrayToHex(inn.witness[0]));
    if (inn.witness[1]) txinwitness.push(uint8ArrayToHex(inn.witness[1]));

    ret.vin.push({
      txid: uint8ArrayToHex(new Uint8Array(inn.hash).reverse()),
      vout: inn.index,
      scriptSig: { hex: uint8ArrayToHex(inn.script), asm: '' },
      txinwitness,
      sequence: inn.sequence,
    });
  }

  let n = 0;
  for (const out of tx.outs) {
    const value = new BigNumber(out.value).dividedBy(100000000).toNumber();
    let address: false | string = false;
    let type: false | string = false;

    if (SegwitBech32Wallet.scriptPubKeyToAddress(uint8ArrayToHex(out.script))) {
      address = SegwitBech32Wallet.scriptPubKeyToAddress(uint8ArrayToHex(out.script));
      type = 'witness_v0_keyhash';
    } else if (SegwitP2SHWallet.scriptPubKeyToAddress(uint8ArrayToHex(out.script))) {
      address = SegwitP2SHWallet.scriptPubKeyToAddress(uint8ArrayToHex(out.script));
      type = '???'; // TODO
    } else if (LegacyWallet.scriptPubKeyToAddress(uint8ArrayToHex(out.script))) {
      address = LegacyWallet.scriptPubKeyToAddress(uint8ArrayToHex(out.script));
      type = '???'; // TODO
    } else {
      address = TaprootWallet.scriptPubKeyToAddress(uint8ArrayToHex(out.script));
      type = 'witness_v1_taproot';
    }

    if (!address) {
      throw new Error('Internal error: unable to decode address from output script');
    }

    ret.vout.push({
      value,
      n,
      scriptPubKey: {
        asm: '',
        hex: uint8ArrayToHex(out.script),
        reqSigs: 1, // todo
        type,
        addresses: [address],
      },
    });
    n++;
  }
  return ret;
}

export const getTransactionsFullByAddress = async (address: string): Promise<ElectrumTransaction[]> => {
  const txs = await getTransactionsByAddress(address);
  const ret: ElectrumTransaction[] = [];
  for (const tx of txs) {
    let full;
    try {
      full = await mainClient.blockchainTransaction_get(tx.tx_hash, true);
    } catch (error: any) {
      if (String(error?.message ?? error).startsWith('verbose transactions are currently unsupported')) {
        // apparently, stupid esplora instead of returning txhex when it cant return verbose tx started
        // throwing a proper exception. lets fetch txhex manually and decode on our end
        const txhex = await mainClient.blockchainTransaction_get(tx.tx_hash, false);
        full = txhexToElectrumTransaction(txhex);
      } else {
        // nope, its something else
        throw new Error(String(error?.message ?? error));
      }
    }
    full.address = address;
    for (const input of full.vin) {
      // now we need to fetch previous TX where this VIN became an output, so we can see its amount
      let prevTxForVin;
      try {
        prevTxForVin = await mainClient.blockchainTransaction_get(input.txid, true);
      } catch (error: any) {
        if (String(error?.message ?? error).startsWith('verbose transactions are currently unsupported')) {
          // apparently, stupid esplora instead of returning txhex when it cant return verbose tx started
          // throwing a proper exception. lets fetch txhex manually and decode on our end
          const txhex = await mainClient.blockchainTransaction_get(input.txid, false);
          prevTxForVin = txhexToElectrumTransaction(txhex);
        } else {
          // nope, its something else
          throw new Error(String(error?.message ?? error));
        }
      }
      if (prevTxForVin && prevTxForVin.vout && prevTxForVin.vout[input.vout]) {
        input.value = prevTxForVin.vout[input.vout].value;
        // also, we extract destination address from prev output:
        if (prevTxForVin.vout[input.vout].scriptPubKey && prevTxForVin.vout[input.vout].scriptPubKey.addresses) {
          input.addresses = prevTxForVin.vout[input.vout].scriptPubKey.addresses;
        }
        // in bitcoin core 22.0.0+ they removed `.addresses` and replaced it with plain `.address`:
        if (prevTxForVin.vout[input.vout]?.scriptPubKey?.address) {
          input.addresses = [prevTxForVin.vout[input.vout].scriptPubKey.address];
        }
      }
    }

    for (const output of full.vout) {
      if (output?.scriptPubKey && output.scriptPubKey.addresses) output.addresses = output.scriptPubKey.addresses;
      // in bitcoin core 22.0.0+ they removed `.addresses` and replaced it with plain `.address`:
      if (output?.scriptPubKey?.address) output.addresses = [output.scriptPubKey.address];
    }
    full.inputs = full.vin;
    full.outputs = full.vout;
    delete full.vin;
    delete full.vout;
    delete full.hex; // compact
    delete full.hash; // compact
    ret.push(full);
  }

  return ret;
};

type MultiGetBalanceResponse = {
  balance: number;
  unconfirmed_balance: number;
  addresses: Record<string, { confirmed: number; unconfirmed: number }>;
};

export const multiGetBalanceByAddress = async (addresses: string[], batchsize: number = 200): Promise<MultiGetBalanceResponse> => {
  if (!mainClient) throw new Error('Electrum client is not connected');
  const ret = {
    balance: 0,
    unconfirmed_balance: 0,
    addresses: {} as Record<string, { confirmed: number; unconfirmed: number }>,
  };

  const chunks = splitIntoChunks(addresses, batchsize);
  for (const chunk of chunks) {
    const scripthashes = [];
    const scripthash2addr: Record<string, string> = {};
    for (const addr of chunk) {
      const script = bitcoin.address.toOutputScript(addr);
      const hash = bitcoinjs_crypto_sha256(script);
      const reversedHash = uint8ArrayToHex(new Uint8Array(hash).reverse());
      scripthashes.push(reversedHash);
      scripthash2addr[reversedHash] = addr;
    }

    let balances = [];

    if (disableBatching) {
      const promises = [];
      const index2scripthash: Record<number, string> = {};
      for (let promiseIndex = 0; promiseIndex < scripthashes.length; promiseIndex++) {
        promises.push(mainClient.blockchainScripthash_getBalance(scripthashes[promiseIndex]));
        index2scripthash[promiseIndex] = scripthashes[promiseIndex];
      }
      const promiseResults = await Promise.all(promises);
      for (let resultIndex = 0; resultIndex < promiseResults.length; resultIndex++) {
        balances.push({ result: promiseResults[resultIndex], param: index2scripthash[resultIndex] });
      }
    } else {
      balances = await mainClient.blockchainScripthash_getBalanceBatch(scripthashes);
    }

    for (const bal of balances) {
      if (bal.error) console.warn('multiGetBalanceByAddress():', bal.error);
      ret.balance += +bal.result.confirmed;
      ret.unconfirmed_balance += +bal.result.unconfirmed;
      ret.addresses[scripthash2addr[bal.param]] = bal.result;
    }
  }

  return ret;
};

export const multiGetUtxoByAddress = async function (addresses: string[], batchsize: number = 100): Promise<Record<string, Utxo[]>> {
  if (!mainClient) throw new Error('Electrum client is not connected');
  const ret: Record<string, any> = {};

  const chunks = splitIntoChunks(addresses, batchsize);
  for (const chunk of chunks) {
    const scripthashes = [];
    const scripthash2addr: Record<string, string> = {};
    for (const addr of chunk) {
      const script = bitcoin.address.toOutputScript(addr);
      const hash = bitcoinjs_crypto_sha256(script);
      const reversedHash = uint8ArrayToHex(new Uint8Array(hash).reverse());
      scripthashes.push(reversedHash);
      scripthash2addr[reversedHash] = addr;
    }

    let results = [];

    if (disableBatching) {
      // ElectrumPersonalServer doesnt support `blockchain.scripthash.listunspent`
      // electrs OTOH supports it, but we dont know it we are currently connected to it or to EPS
      // so it is pretty safe to do nothing, as caller can derive UTXO from stored transactions
    } else {
      results = await mainClient.blockchainScripthash_listunspentBatch(scripthashes);
    }

    for (const utxos of results) {
      ret[scripthash2addr[utxos.param]] = utxos.result;
      for (const utxo of ret[scripthash2addr[utxos.param]]) {
        utxo.address = scripthash2addr[utxos.param];
        utxo.txid = utxo.tx_hash;
        utxo.vout = utxo.tx_pos;
        delete utxo.tx_pos;
        delete utxo.tx_hash;
      }
    }
  }

  return ret;
};

export type ElectrumHistory = {
  tx_hash: string;
  height: number;
  address: string;
};

export const multiGetHistoryByAddress = async function (
  addresses: string[],
  batchsize: number = 100,
): Promise<Record<string, ElectrumHistory[]>> {
  if (!mainClient) throw new Error('Electrum client is not connected');
  const ret: Record<string, ElectrumHistory[]> = {};

  const chunks = splitIntoChunks(addresses, batchsize);
  for (const chunk of chunks) {
    const scripthashes = [];
    const scripthash2addr: Record<string, string> = {};
    for (const addr of chunk) {
      const script = bitcoin.address.toOutputScript(addr);
      const hash = bitcoinjs_crypto_sha256(script);
      const reversedHash = uint8ArrayToHex(new Uint8Array(hash).reverse());
      scripthashes.push(reversedHash);
      scripthash2addr[reversedHash] = addr;
    }

    let results = [];

    if (disableBatching) {
      const promises = [];
      const index2scripthash: Record<number, string> = {};
      for (let promiseIndex = 0; promiseIndex < scripthashes.length; promiseIndex++) {
        index2scripthash[promiseIndex] = scripthashes[promiseIndex];
        promises.push(mainClient.blockchainScripthash_getHistory(scripthashes[promiseIndex]));
      }
      const histories = await Promise.all(promises);
      for (let historyIndex = 0; historyIndex < histories.length; historyIndex++) {
        results.push({ result: histories[historyIndex], param: index2scripthash[historyIndex] });
      }
    } else {
      results = await mainClient.blockchainScripthash_getHistoryBatch(scripthashes);
    }

    for (const history of results) {
      if (history.error) console.warn('multiGetHistoryByAddress():', history.error);
      ret[scripthash2addr[history.param]] = history.result || [];
      for (const result of history.result || []) {
        if (result.tx_hash) txhashHeightCache[result.tx_hash] = result.height; // cache tx height
      }

      for (const hist of ret[scripthash2addr[history.param]]) {
        hist.address = scripthash2addr[history.param];
      }
    }
  }

  return ret;
};

// if verbose === true ? Record<string, ElectrumTransaction> : Record<string, string>
type MultiGetTransactionByTxidResult<T extends boolean> = T extends true ? Record<string, ElectrumTransaction> : Record<string, string>;

// TODO: this function returns different results based on the value of `verboseParam`, consider splitting it into two
export async function multiGetTransactionByTxid<T extends boolean>(
  txids: string[],
  verbose: T,
  batchsize: number = 45,
): Promise<MultiGetTransactionByTxidResult<T>> {
  txids = txids.filter(txid => !!txid); // failsafe: removing 'undefined' or other falsy stuff from txids array
  // this value is fine-tuned so althrough wallets in test suite will occasionally
  // throw 'response too large (over 1,000,000 bytes', test suite will pass
  if (!mainClient) throw new Error('Electrum client is not connected');
  const ret: MultiGetTransactionByTxidResult<T> = {};
  txids = [...new Set(txids)]; // deduplicate just for any case

  // lets try cache first:
  const realm = await _getRealm();
  const cacheKeySuffix = verbose ? '_verbose' : '_non_verbose';
  const keysCacheMiss = [];
  for (const txid of txids) {
    const jsonString = realm.objectForPrimaryKey('Cache', txid + cacheKeySuffix); // search for a realm object with a primary key
    if (jsonString && jsonString.cache_value) {
      try {
        ret[txid] = JSON.parse(jsonString.cache_value as string);
      } catch (error) {
        console.log(error, 'cache failed to parse', jsonString.cache_value);
      }
    }

    if (!ret[txid]) keysCacheMiss.push(txid);
  }

  if (keysCacheMiss.length === 0) {
    return ret;
  }

  txids = keysCacheMiss;
  // end cache

  const chunks = splitIntoChunks(txids, batchsize);
  for (const chunk of chunks) {
    let results = [];

    if (disableBatching) {
      try {
        // in case of ElectrumPersonalServer it might not track some transactions (like source transactions for our transactions)
        // so we wrap it in try-catch. note, when `Promise.all` fails we will get _zero_ results, but we have a fallback for that
        const promises = [];
        const index2txid: Record<number, string> = {};
        for (let promiseIndex = 0; promiseIndex < chunk.length; promiseIndex++) {
          const txid = chunk[promiseIndex];
          index2txid[promiseIndex] = txid;
          promises.push(mainClient.blockchainTransaction_get(txid, verbose));
        }

        const transactionResults = await Promise.all(promises);
        for (let resultIndex = 0; resultIndex < transactionResults.length; resultIndex++) {
          let tx = transactionResults[resultIndex];
          if (typeof tx === 'string' && verbose) {
            // apparently electrum server (EPS?) didnt recognize VERBOSE parameter, and  sent us plain txhex instead of decoded tx.
            // lets decode it manually on our end then:
            tx = txhexToElectrumTransaction(tx);
          }
          const txid = index2txid[resultIndex];
          results.push({ result: tx, param: txid });
        }
      } catch (error: any) {
        if (String(error?.message ?? error).startsWith('verbose transactions are currently unsupported')) {
          // electrs-esplora. cant use verbose, so fetching txs one by one and decoding locally
          for (const txid of chunk) {
            try {
              let tx = await mainClient.blockchainTransaction_get(txid, false);
              tx = txhexToElectrumTransaction(tx);
              results.push({ result: tx, param: txid });
            } catch (err) {
              console.log(err);
            }
          }
        } else {
          // fallback. pretty sure we are connected to EPS.  we try getting transactions one-by-one. this way we wont
          // fail and only non-tracked by EPS transactions will be omitted
          for (const txid of chunk) {
            try {
              let tx = await mainClient.blockchainTransaction_get(txid, verbose);
              if (typeof tx === 'string' && verbose) {
                // apparently electrum server (EPS?) didnt recognize VERBOSE parameter, and  sent us plain txhex instead of decoded tx.
                // lets decode it manually on our end then:
                tx = txhexToElectrumTransaction(tx);
              }
              results.push({ result: tx, param: txid });
            } catch (err) {
              console.log(err);
            }
          }
        }
      }
    } else {
      results = await mainClient.blockchainTransaction_getBatch(chunk, verbose);
    }

    for (const txdata of results) {
      if (txdata.error && txdata.error.code === -32600) {
        // response too large
        // lets do single call, that should go through okay:
        txdata.result = await mainClient.blockchainTransaction_get(txdata.param, false);
        // since we used VERBOSE=false, server sent us plain txhex which we must decode on our end:
        txdata.result = txhexToElectrumTransaction(txdata.result);
      }
      ret[txdata.param] = txdata.result;
      // @ts-ignore: hex property
      if (ret[txdata.param]) delete ret[txdata.param].hex; // compact
    }
  }

  // in bitcoin core 22.0.0+ they removed `.addresses` and replaced it with plain `.address`:
  for (const txid of Object.keys(ret)) {
    const tx = ret[txid];
    if (typeof tx === 'string') continue;
    for (const vout of tx?.vout ?? []) {
      // @ts-ignore: address is not in type definition
      if (vout?.scriptPubKey?.address) vout.scriptPubKey.addresses = [vout.scriptPubKey.address];
    }
  }

  // saving cache:
  try {
    realm.write(() => {
      for (const txid of Object.keys(ret)) {
        const tx = ret[txid];
        // dont cache immature txs, but only for 'verbose', since its fully decoded tx jsons. non-verbose are just plain
        // strings txhex
        if (verbose && typeof tx !== 'string' && (!tx?.confirmations || tx.confirmations < 7)) {
          continue;
        }

        realm.create(
          'Cache',
          {
            cache_key: txid + cacheKeySuffix,
            cache_value: JSON.stringify(ret[txid]),
          },
          Realm.UpdateMode.Modified,
        );
      }
    });
  } catch (writeError) {
    console.error('Failed to write transaction cache:', writeError);
  }

  return ret;
}

/**
 * Simple waiter till `mainConnected` becomes true (which means
 * it Electrum was connected in other function), or timeout 30 sec.
 */
export const waitTillConnected = async function (): Promise<boolean> {
  let waitTillConnectedInterval: NodeJS.Timeout | undefined;
  let retriesCounter = 0;
  if (await isDisabled()) {
    console.warn('Electrum connections disabled by user. waitTillConnected skipping...');
    return false;
  }
  return new Promise(function (resolve, reject) {
    waitTillConnectedInterval = setInterval(() => {
      if (mainConnected) {
        clearInterval(waitTillConnectedInterval);
        return resolve(true);
      }

      if (wasConnectedAtLeastOnce && retriesCounter++ >= 150) {
        // `wasConnectedAtLeastOnce` needed otherwise theres gona be a race condition with the code that connects
        // electrum during app startup
        clearInterval(waitTillConnectedInterval);
        presentNetworkErrorAlert();
        reject(new Error('Waiting for Electrum connection timeout'));
      }
    }, 100);
  });
};

// Returns the value at a given percentile in a sorted numeric array.
// "Linear interpolation between closest ranks" method
function percentile(arr: number[], p: number) {
  if (arr.length === 0) return 0;
  if (typeof p !== 'number') throw new TypeError('p must be a number');
  if (p <= 0) return arr[0];
  if (p >= 1) return arr[arr.length - 1];

  const index = (arr.length - 1) * p;
  const lower = Math.floor(index);
  const upper = lower + 1;
  const weight = index % 1;

  if (upper >= arr.length) return arr[lower];
  return arr[lower] * (1 - weight) + arr[upper] * weight;
}

/**
 * The histogram is an array of [fee, vsize] pairs, where vsizen is the cumulative virtual size of mempool transactions
 * with a fee rate in the interval [feen-1, feen], and feen-1 > feen.
 */
export const calcEstimateFeeFromFeeHistorgam = function (numberOfBlocks: number, feeHistorgram: number[][]) {
  // first, transforming histogram:
  let totalVsize = 0;
  const histogramToUse = [];
  for (const h of feeHistorgram) {
    let [fee, vsize] = h;
    let timeToStop = false;

    if (totalVsize + vsize >= 1000000 * numberOfBlocks) {
      vsize = 1000000 * numberOfBlocks - totalVsize; // only the difference between current summarized sige to tip of the block
      timeToStop = true;
    }

    histogramToUse.push({ fee, vsize });
    totalVsize += vsize;
    if (timeToStop) break;
  }

  // now we have histogram of precisely size for numberOfBlocks.
  // lets spread it into flat array so its easier to calculate percentile:
  let histogramFlat: number[] = [];
  for (const hh of histogramToUse) {
    histogramFlat = histogramFlat.concat(Array(Math.round(hh.vsize / 25000)).fill(hh.fee));
    // division is needed so resulting flat array is not too huge
  }

  histogramFlat = histogramFlat.sort(function (a, b) {
    return a - b;
  });

  return Math.round(percentile(histogramFlat, 0.5) || 1);
};

export const estimateFees = async function (): Promise<{ fast: number; medium: number; slow: number }> {
  let histogram;
  let timeoutId;
  try {
    histogram = await Promise.race([
      mainClient.mempool_getFeeHistogram(),
      new Promise(resolve => (timeoutId = setTimeout(resolve, 15000))),
    ]);
  } finally {
    clearTimeout(timeoutId);
  }

  // fetching what electrum (which uses bitcoin core) thinks about fees:
  const _fast = await estimateFee(1);
  const _medium = await estimateFee(18);
  const _slow = await estimateFee(144);

  /**
   * sanity check, see
   * @see https://github.com/cculianu/Fulcrum/issues/197
   * (fallback to bitcoin core estimates)
   */
  if (!histogram || histogram?.[0]?.[0] > 1000) return { fast: _fast, medium: _medium, slow: _slow };

  // calculating fast fees from mempool:
  const fast = Math.max(2, calcEstimateFeeFromFeeHistorgam(1, histogram));
  // recalculating medium and slow fees using bitcoincore estimations only like relative weights:
  // (minimum 1 sat, just for any case)
  const medium = Math.max(1, Math.round((fast * _medium) / _fast));
  const slow = Math.max(1, Math.round((fast * _slow) / _fast));
  return { fast, medium, slow };
};

/**
 * Returns the estimated transaction fee to be confirmed within a certain number of blocks
 *
 * @param numberOfBlocks {number} The number of blocks to target for confirmation
 * @returns {Promise<number>} Satoshis per byte
 */
export const estimateFee = async function (numberOfBlocks: number): Promise<number> {
  if (!mainClient) throw new Error('Electrum client is not connected');
  numberOfBlocks = numberOfBlocks || 1;
  const coinUnitsPerKilobyte = await mainClient.blockchainEstimatefee(numberOfBlocks);
  if (coinUnitsPerKilobyte === -1) return 1;
  return Math.round(new BigNumber(coinUnitsPerKilobyte).dividedBy(1024).multipliedBy(100000000).toNumber());
};

export const serverFeatures = async function () {
  if (!mainClient) throw new Error('Electrum client is not connected');
  return mainClient.server_features();
};

export const broadcast = async function (hex: string) {
  if (!mainClient) throw new Error('Electrum client is not connected');
  try {
    const res = await mainClient.blockchainTransaction_broadcast(hex);
    return res;
  } catch (error) {
    return error;
  }
};

export const broadcastV2 = async function (hex: string): Promise<string> {
  if (!mainClient) throw new Error('Electrum client is not connected');
  return mainClient.blockchainTransaction_broadcast(hex);
};

export const estimateCurrentBlockheight = function (): number {
  if (latestBlock.height) {
    const timeDiff = Math.floor(+new Date() / 1000) - latestBlock.time;
    const extraBlocks = Math.floor(timeDiff / (9.93 * 60));
    return latestBlock.height + extraBlocks;
  }

  const baseTs = 1587570465609; // uS
  const baseHeight = 627179;
  return Math.floor(baseHeight + (+new Date() - baseTs) / 1000 / 60 / 9.93);
};

export const calculateBlockTime = function (height: number): number {
  if (latestBlock.height) {
    return Math.floor(latestBlock.time + (height - latestBlock.height) * 9.93 * 60);
  }

  const baseTs = 1585837504; // sec
  const baseHeight = 624083;
  return Math.floor(baseTs + (height - baseHeight) * 9.93 * 60);
};

/**
 * @returns {Promise<boolean>} Whether provided host:port is a valid electrum server
 */
export const testConnection = async function (host: string, tcpPort?: number, sslPort?: number): Promise<boolean> {
  const networkModules = await getElectrumNetworkModules();
  const client = new ElectrumClient(networkModules.net, networkModules.tls, sslPort || tcpPort, host, sslPort ? 'tls' : 'tcp');

  client.onError = () => {}; // mute
  let timeoutId: NodeJS.Timeout | undefined;
  try {
    const rez = await Promise.race([
      new Promise(resolve => {
        timeoutId = setTimeout(() => resolve('timeout'), 5000);
      }),
      client.connect(),
    ]);
    if (rez === 'timeout') return false;

    await client.server_version('2.7.11', '1.4');
    await client.server_ping();
    return true;
  } catch (_) {
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    client.close();
  }

  return false;
};

export const forceDisconnect = (): void => {
  mainClient?.close();
};

export const setBatchingDisabled = () => {
  disableBatching = true;
};

export const setBatchingEnabled = () => {
  disableBatching = false;
};

export function getServerBanner(): Promise<string> {
  return mainClient.request('server.banner', []);
}

const splitIntoChunks = function (arr: any[], chunkSize: number) {
  const groups = [];
  let i;
  for (i = 0; i < arr.length; i += chunkSize) {
    groups.push(arr.slice(i, i + chunkSize));
  }
  return groups;
};

const semVerToInt = function (semver: string): number {
  if (!semver) return 0;
  if (semver.split('.').length !== 3) return 0;

  const ret = Number(semver.split('.')[0]) * 1000000 + Number(semver.split('.')[1]) * 1000 + Number(semver.split('.')[2]) * 1;

  if (isNaN(ret)) return 0;

  return ret;
};
