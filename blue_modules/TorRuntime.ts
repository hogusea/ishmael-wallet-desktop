import { NativeModules, Platform } from 'react-native';

export type TorRuntimeStatus = {
  available: boolean;
  running: boolean;
  pid?: number;
  reason?: string;
};

interface TorRuntimeNativeModule {
  startTorRuntime?: () => Promise<boolean>;
  stopTorRuntime?: () => Promise<boolean>;
  getTorRuntimeStatus?: () => Promise<TorRuntimeStatus>;
}

const torRuntimeModule: TorRuntimeNativeModule | undefined =
  Platform.OS === 'ios' ? (NativeModules.MenuElementsEmitter as TorRuntimeNativeModule | undefined) : undefined;

const unavailableStatus: TorRuntimeStatus = {
  available: false,
  running: false,
  reason: 'native_tor_runtime_unavailable',
};

export const getStatus = async (): Promise<TorRuntimeStatus> => {
  if (!torRuntimeModule?.getTorRuntimeStatus) {
    return unavailableStatus;
  }

  try {
    const status = await torRuntimeModule.getTorRuntimeStatus();
    if (!status || typeof status !== 'object') {
      return unavailableStatus;
    }
    return {
      available: Boolean(status.available),
      running: Boolean(status.running),
      pid: typeof status.pid === 'number' ? status.pid : undefined,
      reason: status.reason,
    };
  } catch (error) {
    console.warn('[TorRuntime] Failed to query runtime status:', error);
    return unavailableStatus;
  }
};

export const start = async (): Promise<boolean> => {
  if (!torRuntimeModule?.startTorRuntime) return false;
  try {
    return !!(await torRuntimeModule.startTorRuntime());
  } catch (error) {
    console.warn('[TorRuntime] Failed to start embedded Tor runtime:', error);
    return false;
  }
};

export const stop = async (): Promise<boolean> => {
  if (!torRuntimeModule?.stopTorRuntime) return false;
  try {
    return !!(await torRuntimeModule.stopTorRuntime());
  } catch (error) {
    console.warn('[TorRuntime] Failed to stop embedded Tor runtime:', error);
    return false;
  }
};
