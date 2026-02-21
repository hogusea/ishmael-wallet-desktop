import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RouteProp, useRoute } from '@react-navigation/native';
import Clipboard from '@react-native-clipboard/clipboard';
import { Image, Keyboard, Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import { BlueFormLabel, BlueFormMultiInput } from '../../BlueComponents';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { WatchOnlyWallet } from '../../class';
import Button from '../../components/Button';
import {
  DoneAndDismissKeyboardInputAccessory,
  DoneAndDismissKeyboardInputAccessoryViewID,
} from '../../components/DoneAndDismissKeyboardInputAccessory';
import presentAlert from '../../components/Alert';
import { AddressInputScanButton } from '../../components/AddressInputScanButton';
import { BlueSpacing20 } from '../../components/BlueSpacing';
import SafeAreaScrollView from '../../components/SafeAreaScrollView';
import { useTheme } from '../../components/themes';
import { useStorage } from '../../hooks/context/useStorage';
import { useSettings } from '../../hooks/context/useSettings';
import { useExtendedNavigation } from '../../hooks/useExtendedNavigation';
import { useKeyboard } from '../../hooks/useKeyboard';
import { useScreenProtect } from '../../hooks/useScreenProtect';
import loc from '../../loc';
import { AddWalletStackParamList } from '../../navigation/AddWalletStack';

type RouteProps = RouteProp<AddWalletStackParamList, 'ImportWallet'>;
type NavigationProps = NativeStackNavigationProp<AddWalletStackParamList, 'ImportWallet'>;

const WATCH_ONLY_IMPORT_ERROR = 'Only xpub/ypub/zpub or a single BTCmobick address can be imported in this app.';
const DUPLICATE_WALLET_ERROR = 'This wallet has been previously imported.';
const QR_ECHO_IGNORE_WINDOW_MS = 1500;

const sanitizeImportText = (value: string) => value.replace(/\s+/g, '').trim();
type ImportWatchOnlyOptions = {
  clearInputOnError?: boolean;
};

const buildWatchOnlyWallet = (secret: string): WatchOnlyWallet | undefined => {
  const wallet = new WatchOnlyWallet();
  wallet.setSecret(secret);
  wallet.init();

  const isAllowedSecret = wallet.isHd() ? wallet.isXpubValid() : wallet.isAddressValid(secret);
  if (!isAllowedSecret) return;

  // xpub wallets should be ready for PSBT export/import flow.
  if (wallet.isHd()) wallet.setUseWithHardwareWalletEnabled(true);
  return wallet;
};

const ImportWallet = () => {
  const navigation = useExtendedNavigation<NavigationProps>();
  const route = useRoute<RouteProps>();
  const { addAndSaveWallet, wallets } = useStorage();
  const { isPrivacyBlurEnabled } = useSettings();
  const { colors, closeImage } = useTheme();
  const { enableScreenProtect, disableScreenProtect } = useScreenProtect();

  const label = route?.params?.label ?? '';
  const triggerImport = route?.params?.triggerImport ?? false;
  const [importText, setImportText] = useState<string>(sanitizeImportText(label));
  const [isImporting, setIsImporting] = useState(false);
  const [isToolbarVisibleForAndroid, setIsToolbarVisibleForAndroid] = useState(false);
  const recentQrScanRef = useRef<{ value: string; at: number }>({ value: '', at: 0 });

  const styles = StyleSheet.create({
    root: {
      paddingTop: 10,
      backgroundColor: colors.elevated,
      flex: 1,
    },
    center: {
      flex: 1,
      marginHorizontal: 16,
      backgroundColor: colors.elevated,
    },
    button: {
      padding: 10,
    },
  });

  useKeyboard({
    onKeyboardDidShow: () => {
      setIsToolbarVisibleForAndroid(true);
    },
    onKeyboardDidHide: () => {
      setIsToolbarVisibleForAndroid(false);
    },
  });

  useEffect(() => {
    if (isPrivacyBlurEnabled) {
      enableScreenProtect();
    }
    return () => {
      disableScreenProtect();
    };
  }, [isPrivacyBlurEnabled, enableScreenProtect, disableScreenProtect]);

  const onBlur = useCallback(() => {
    const sanitized = sanitizeImportText(importText);
    setImportText(sanitized);
    return sanitized;
  }, [importText]);

  const importWatchOnly = useCallback(
    async (value: string, options: ImportWatchOnlyOptions = {}) => {
      const secret = sanitizeImportText(value);
      if (!secret || isImporting) return;

      const wallet = buildWatchOnlyWallet(secret);
      if (!wallet) {
        if (options.clearInputOnError) setImportText('');
        presentAlert({ title: loc.errors.error, message: WATCH_ONLY_IMPORT_ERROR });
        return;
      }

      if (wallets.some(existingWallet => existingWallet.getID() === wallet.getID())) {
        if (options.clearInputOnError) setImportText('');
        presentAlert({ title: loc.errors.error, message: DUPLICATE_WALLET_ERROR });
        return;
      }

      setImportText(secret);
      Keyboard.dismiss();
      setIsImporting(true);

      try {
        if (await Clipboard.hasString()) Clipboard.setString('');
      } catch (error) {
        console.error('Failed to clear clipboard:', error);
      }

      try {
        await addAndSaveWallet(wallet);
        navigation.getParent()?.goBack();
      } catch (error: any) {
        if (options.clearInputOnError) setImportText('');
        presentAlert({ title: loc.errors.error, message: error?.message || WATCH_ONLY_IMPORT_ERROR });
      } finally {
        setIsImporting(false);
      }
    },
    [addAndSaveWallet, isImporting, navigation, wallets],
  );

  const handleImport = useCallback(() => {
    importWatchOnly(onBlur());
  }, [importWatchOnly, onBlur]);

  const onBarScanned = useCallback(
    (value: string | { data: unknown }) => {
      const scannedValue = sanitizeImportText(typeof value === 'string' ? value : String(value.data ?? ''));
      if (!scannedValue) return;
      recentQrScanRef.current = { value: scannedValue, at: Date.now() };
      importWatchOnly(scannedValue, { clearInputOnError: true });
    },
    [importWatchOnly],
  );

  const onScanButtonChangeText = useCallback((value: string) => {
    const sanitizedValue = sanitizeImportText(value);
    const { value: recentValue, at } = recentQrScanRef.current;
    const isRecentQrEcho = sanitizedValue.length > 0 && sanitizedValue === recentValue && Date.now() - at <= QR_ECHO_IGNORE_WINDOW_MS;

    if (isRecentQrEcho) return;
    setImportText(sanitizedValue);
  }, []);

  useEffect(() => {
    const data = route.params?.onBarScanned;
    if (!data) return;
    onBarScanned(data);
    navigation.setParams({ onBarScanned: undefined });
  }, [navigation, onBarScanned, route.params?.onBarScanned]);

  useEffect(() => {
    if (triggerImport) handleImport();
  }, [handleImport, triggerImport]);

  useEffect(() => {
    navigation.setOptions({
      headerLeft:
        navigation.getState().index === 0
          ? () => (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={loc._.close}
                style={styles.button}
                onPress={() => navigation.goBack()}
                testID="NavigationCloseButton"
              >
                <Image source={closeImage} />
              </TouchableOpacity>
            )
          : undefined,
    });
  }, [closeImage, navigation, styles.button]);

  const renderOptionsAndImportButton = (
    <>
      <BlueSpacing20 />
      <View style={styles.center}>
        <Button
          disabled={importText.trim().length === 0 || isImporting}
          title={loc.wallets.import_do_import}
          testID="DoImport"
          onPress={handleImport}
        />
        <BlueSpacing20 />
        <AddressInputScanButton type="link" onChangeText={onScanButtonChangeText} testID="ScanImport" />
      </View>
    </>
  );

  return (
    <SafeAreaScrollView contentContainerStyle={styles.root} keyboardShouldPersistTaps="always" automaticallyAdjustKeyboardInsets>
      <BlueSpacing20 />
      <BlueFormLabel>{loc.wallets.import_explanation}</BlueFormLabel>
      <BlueSpacing20 />
      <BlueFormMultiInput
        value={importText}
        onBlur={onBlur}
        onChangeText={setImportText}
        testID="MnemonicInput"
        inputAccessoryViewID={DoneAndDismissKeyboardInputAccessoryViewID}
      />
      {Platform.select({ android: !isToolbarVisibleForAndroid && renderOptionsAndImportButton, default: renderOptionsAndImportButton })}
      {Platform.select({
        ios: (
          <DoneAndDismissKeyboardInputAccessory
            onClearTapped={() => {
              setImportText('');
            }}
            onPasteTapped={text => {
              setImportText(sanitizeImportText(text));
              Keyboard.dismiss();
            }}
          />
        ),
        default: null,
      })}
    </SafeAreaScrollView>
  );
};

export default ImportWallet;
