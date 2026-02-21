import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React, { lazy } from 'react';

import navigationStyle from '../components/navigationStyle';
import { useTheme } from '../components/themes';
import loc from '../loc';
import { withLazySuspense } from './LazyLoadingIndicator';
import { ScanQRCodeParamList } from './DetailViewStackParamList';

export type AddWalletStackParamList = {
  AddWallet: {
    entropy?: string;
    words?: number;
  };
  ImportWallet?: {
    label?: string;
    triggerImport?: boolean;
    onBarScanned?: string;
  };
  ImportWalletDiscovery: {
    importText: string;
    askPassphrase: boolean;
    searchAccounts: boolean;
  };
  ImportSpeed: undefined;
  ImportCustomDerivationPath: {
    importText: string;
    password: string | undefined;
  };
  PleaseBackup: {
    walletID: string;
  };
  PleaseBackupLNDHub: {
    walletID: string;
  };
  ProvideEntropy: {
    words: number;
    entropy?: string;
  };
  WalletsAddMultisig: {
    walletLabel: string;
  };
  MultisigAdvanced: {
    m: number;
    n: number;
    format: string;
    onSave: (m: number, n: number, format: string) => void;
  };
  WalletsAddMultisigStep2: {
    m: number;
    n: number;
    walletLabel: string;
    format: string;
    onBarScanned?: string;
  };
  WalletsAddMultisigHelp: undefined;
  ScanQRCode: ScanQRCodeParamList;
};

const Stack = createNativeStackNavigator<AddWalletStackParamList>();

const ImportWallet = lazy(() => import('../screen/wallets/ImportWallet'));
const ScanQRCode = lazy(() => import('../screen/send/ScanQRCode'));

const ImportWalletComponent = withLazySuspense(ImportWallet);
const ScanQRCodeComponent = withLazySuspense(ScanQRCode);

const AddWalletStack = () => {
  const theme = useTheme();
  return (
    <Stack.Navigator initialRouteName="ImportWallet">
      <Stack.Screen
        name="ImportWallet"
        component={ImportWalletComponent}
        options={navigationStyle({ title: loc.wallets.import_title })(theme)}
      />
      <Stack.Screen
        name="ScanQRCode"
        component={ScanQRCodeComponent}
        options={navigationStyle({
          headerShown: false,
          statusBarHidden: true,
          presentation: 'fullScreenModal',
          headerShadowVisible: false,
        })(theme)}
      />
    </Stack.Navigator>
  );
};

export default AddWalletStack;
