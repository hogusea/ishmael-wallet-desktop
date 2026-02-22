import { DrawerContentScrollView, DrawerContentComponentProps } from '@react-navigation/drawer';
import { useIsFocused, useNavigationState } from '@react-navigation/native';
import React, { memo, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { InteractionManager, StyleSheet, View, ViewStyle, Animated, ScrollView, Pressable, Text, Alert } from 'react-native';
import { TWallet } from '../../class/wallets/types';
import { Header } from '../../components/Header';
import { useTheme } from '../../components/themes';
import WalletsCarousel from '../../components/WalletsCarousel';
import loc from '../../loc';
import { useStorage } from '../../hooks/context/useStorage';
import TotalWalletsBalance from '../../components/TotalWalletsBalance';
import { useSettings } from '../../hooks/context/useSettings';
import { useExtendedNavigation } from '../../hooks/useExtendedNavigation';
import * as BlueElectrum from '../../blue_modules/BlueElectrum';

enum WalletActionType {
  SetWallets = 'SET_WALLETS',
  SelectWallet = 'SELECT_WALLET',
  SetFocus = 'SET_FOCUS',
  Navigate = 'NAVIGATE',
  WalletAdded = 'WALLET_ADDED',
  WalletRemoved = 'WALLET_REMOVED',
}

interface WalletState {
  wallets: TWallet[];
  isFocused: boolean;
  walletAdded: boolean;
  walletRemoved: boolean;
}

interface SelectWalletAction {
  type: WalletActionType.SelectWallet;
  walletID: string;
  walletType: string;
}

interface NavigateAction {
  type: WalletActionType.Navigate;
  screen: string;
  params: { [key: string]: any };
}

interface SetFocusAction {
  type: WalletActionType.SetFocus;
  isFocused: boolean;
}

interface SetWalletsAction {
  type: WalletActionType.SetWallets;
  wallets: TWallet[];
}

interface WalletAddedAction {
  type: WalletActionType.WalletAdded;
}

interface WalletRemovedAction {
  type: WalletActionType.WalletRemoved;
}

type WalletAction = SetWalletsAction | SelectWalletAction | SetFocusAction | NavigateAction | WalletAddedAction | WalletRemovedAction;

const walletReducer = (state: WalletState, action: WalletAction): WalletState => {
  switch (action.type) {
    case WalletActionType.SetWallets: {
      return {
        ...state,
        wallets: action.wallets,
      };
    }
    case WalletActionType.SetFocus: {
      return { ...state, isFocused: action.isFocused };
    }
    case WalletActionType.WalletAdded: {
      return { ...state, walletAdded: true, walletRemoved: false };
    }
    case WalletActionType.WalletRemoved: {
      return { ...state, walletAdded: false, walletRemoved: true };
    }
    default:
      return state;
  }
};

const DrawerList: React.FC<DrawerContentComponentProps> = memo((props: DrawerContentComponentProps) => {
  const initialState: WalletState = {
    wallets: [],
    isFocused: false,
    walletAdded: false,
    walletRemoved: false,
  };

  const navigation = useExtendedNavigation();
  const drawerNavigation = props.navigation;

  const [state, dispatch] = useReducer(walletReducer, initialState);
  const walletsCarousel = useRef<any>(null);
  const { wallets, selectedWalletID } = useStorage();
  const { colors } = useTheme();
  const isFocused = useIsFocused();
  const { isTotalBalanceEnabled, isElectrumDisabled } = useSettings();
  const [isTorEnabled, setIsTorEnabled] = useState(false);
  const [isTorToggling, setIsTorToggling] = useState(false);
  const prevWalletCount = useRef(wallets.length);

  const fadeAnim = useRef(new Animated.Value(1)).current;

  const navigationState = useNavigationState(value => value);
  const currentSelectedWalletID = selectedWalletID ? selectedWalletID() : undefined;

  useEffect(() => {
    console.debug('[DrawerList] Navigation state changed, current selectedWalletID:', currentSelectedWalletID);
  }, [navigationState, currentSelectedWalletID]);

  const prevWalletIds = useRef<string[]>([]);

  const scrollViewRef = useRef<ScrollView>(null);
  const lastAddedWalletId = useRef<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    BlueElectrum.isTorEnabled()
      .then(enabled => {
        if (isMounted) {
          setIsTorEnabled(enabled);
        }
      })
      .catch(error => {
        console.error('[DrawerList] Failed to read Tor mode state:', error);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (wallets.length !== prevWalletCount.current) {
      const currentWalletIds = wallets.map(wallet => wallet.getID());

      if (wallets.length > prevWalletCount.current) {
        const addedWalletIds = currentWalletIds.filter(id => !prevWalletIds.current.includes(id));
        if (addedWalletIds.length > 0) {
          dispatch({ type: WalletActionType.WalletAdded });
          lastAddedWalletId.current = addedWalletIds[addedWalletIds.length - 1];

          Animated.sequence([
            Animated.timing(fadeAnim, {
              toValue: 0.7,
              duration: 100,
              useNativeDriver: true,
            }),
            Animated.timing(fadeAnim, {
              toValue: 1,
              duration: 300,
              useNativeDriver: true,
            }),
          ]).start();

          setTimeout(() => {
            if (scrollViewRef.current && lastAddedWalletId.current !== null) {
              const walletIndex = currentWalletIds.indexOf(lastAddedWalletId.current);
              if (walletIndex !== -1) {
                const WALLET_CARD_HEIGHT = 195;
                const scrollPosition = walletIndex * WALLET_CARD_HEIGHT;

                scrollViewRef.current.scrollTo({ y: scrollPosition, animated: true });
              }
            }
          }, 700);
        }
      } else {
        dispatch({ type: WalletActionType.WalletRemoved });

        Animated.sequence([
          Animated.timing(fadeAnim, {
            toValue: 0.5,
            duration: 100,
            useNativeDriver: true,
          }),
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }),
        ]).start();
      }

      prevWalletCount.current = wallets.length;
      prevWalletIds.current = currentWalletIds;

      setTimeout(() => {
        dispatch({ type: WalletActionType.SetWallets, wallets });
      }, 600);
    } else {
      prevWalletIds.current = wallets.map(wallet => wallet.getID());
    }
  }, [wallets, fadeAnim]);

  const isWalletsListActive = useMemo(() => {
    const drawerRoute = navigationState?.routes?.find(route => route.name === 'DrawerRoot');
    if (!drawerRoute || !drawerRoute.state) return true;

    const detailStack = drawerRoute.state.routes.find(route => route.name === 'DetailViewStackScreensStack');
    if (!detailStack || !detailStack.state) return true;

    const currentScreenName = detailStack.state.routes[detailStack.state.index || 0]?.name;
    return currentScreenName === 'WalletsList';
  }, [navigationState]);

  const stylesHook = useMemo(
    () =>
      StyleSheet.create({
        scrollContent: { backgroundColor: colors.elevated, flexGrow: 1 } as ViewStyle,
        section: { backgroundColor: colors.elevated } as ViewStyle,
        torContainer: {
          backgroundColor: colors.elevated,
          borderColor: colors.formBorder,
        } as ViewStyle,
        torLabel: {
          color: colors.foregroundColor,
        },
        torDescription: {
          color: colors.alternativeTextColor,
        },
      }),
    [colors.alternativeTextColor, colors.elevated, colors.foregroundColor, colors.formBorder],
  );

  useEffect(() => {
    dispatch({ type: WalletActionType.SetWallets, wallets });
    dispatch({ type: WalletActionType.SetFocus, isFocused });
  }, [wallets, isFocused]);

  const handleClick = useCallback(
    (item?: TWallet) => {
      if (item?.getID) {
        const walletID = item.getID();
        const walletType = item.type;
        dispatch({ type: WalletActionType.SelectWallet, walletID, walletType });
        InteractionManager.runAfterInteractions(() => {
          drawerNavigation.navigate('DetailViewStackScreensStack', {
            screen: 'WalletTransactions',
            params: { walletID, walletType },
          });
        });
      }
    },
    [drawerNavigation],
  );

  const handleLongPress = useCallback(() => {
    drawerNavigation.closeDrawer();
    navigation.navigate('DrawerRoot', {
      screen: 'DetailViewStackScreensStack',
      params: {
        screen: 'ManageWallets',
      },
    });
  }, [navigation, drawerNavigation]);

  const onNewWalletPress = useCallback(() => {
    navigation.navigate('AddWalletRoot');
  }, [navigation]);

  const onToggleTor = useCallback(async () => {
    if (isTorToggling) return;
    const nextValue = !isTorEnabled;
    setIsTorToggling(true);

    try {
      await BlueElectrum.setTorEnabled(nextValue);
      setIsTorEnabled(nextValue);

      BlueElectrum.forceDisconnect();
      if (!isElectrumDisabled) {
        await BlueElectrum.connectMain();
      }
    } catch (error) {
      console.error('[DrawerList] Failed to toggle Tor mode:', error);
      Alert.alert(loc.errors.network, loc.settings.electrum_error_connect_tor);
    } finally {
      setIsTorToggling(false);
    }
  }, [isElectrumDisabled, isTorEnabled, isTorToggling]);

  return (
    <View style={[styles.drawerRoot, { backgroundColor: colors.elevated }]}>
      <DrawerContentScrollView
        ref={scrollViewRef}
        {...props}
        contentContainerStyle={stylesHook.scrollContent}
        contentInsetAdjustmentBehavior="automatic"
        automaticallyAdjustContentInsets={true}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        directionalLockEnabled
      >
        <Header leftText={loc.wallets.list_title} onNewWalletPress={onNewWalletPress} isDrawerList />
        {isTotalBalanceEnabled && (
          <View style={stylesHook.section}>
            <TotalWalletsBalance />
          </View>
        )}
        <Animated.View style={{ opacity: fadeAnim }}>
          <WalletsCarousel
            data={state.wallets}
            extraData={[state.wallets, currentSelectedWalletID, state.walletAdded, state.walletRemoved, lastAddedWalletId.current]}
            onPress={handleClick}
            handleLongPress={handleLongPress}
            ref={walletsCarousel}
            horizontal={false}
            isFlatList={false}
            onNewWalletPress={onNewWalletPress}
            testID="WalletsList"
            selectedWallet={isWalletsListActive ? undefined : currentSelectedWalletID}
            scrollEnabled={state.isFocused}
            animateChanges
          />
        </Animated.View>
        <View style={styles.torSpacer} />
      </DrawerContentScrollView>

      <View style={[styles.torFloatingContainer, stylesHook.torContainer]}>
        <Pressable
          onPress={onToggleTor}
          disabled={isTorToggling}
          style={({ pressed }) => [styles.torButton, pressed && !isTorToggling ? styles.torButtonPressed : undefined]}
        >
          <View style={styles.torHeaderRow}>
            <Text style={[styles.torLabel, stylesHook.torLabel]}>{loc.settings.tor_quick_toggle}</Text>
            <View style={[styles.torStatusBadge, isTorEnabled ? styles.torStatusOn : styles.torStatusOff]}>
              <Text style={styles.torStatusText}>{isTorToggling ? '...' : isTorEnabled ? loc.settings.tor_on : loc.settings.tor_off}</Text>
            </View>
          </View>
          <Text style={[styles.torDescription, stylesHook.torDescription]}>{loc.settings.tor_quick_toggle_description}</Text>
        </Pressable>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  drawerRoot: {
    flex: 1,
  },
  torSpacer: {
    height: 120,
  },
  torFloatingContainer: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    borderWidth: 1,
    borderRadius: 12,
    padding: 8,
  },
  torButton: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  torButtonPressed: {
    opacity: 0.8,
  },
  torHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  torLabel: {
    fontSize: 15,
    fontWeight: '700',
  },
  torDescription: {
    fontSize: 12,
    lineHeight: 16,
  },
  torStatusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  torStatusOn: {
    backgroundColor: '#2f8f43',
  },
  torStatusOff: {
    backgroundColor: '#6e7681',
  },
  torStatusText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
});

export default DrawerList;
