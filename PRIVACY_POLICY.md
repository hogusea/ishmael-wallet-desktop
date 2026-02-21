# 개인정보처리방침 (Ishmael Wallet)

시행일: 2026-02-20

Ishmael Wallet(이하 "앱")은 사용자의 개인정보를 최소한으로 처리하며, 본 방침은 앱 사용 시 처리되는 정보와 목적을 설명합니다.

## 1. 수집 및 처리하는 정보

### 1) 기기 내 로컬 저장 정보
- 지갑 정보(예: 주소, 공개키(xpub 등), 거래 내역, 메모, 앱 설정)
- 위 정보는 기본적으로 사용자 기기에 저장됩니다.

### 2) 네트워크 사용 시 처리 정보
- 블록체인 조회/동기화를 위해 Electrum 서버 또는 사용자가 설정한 서버와 통신할 때 주소/스크립트해시/거래 식별자(txid) 등이 해당 서버로 전송될 수 있습니다.
- 이 과정에서 서버 운영자는 일반적으로 IP 주소, 접속 시간 등 네트워크 메타데이터를 처리할 수 있습니다.

### 3) 푸시 알림 사용 시 처리 정보 (선택)
- 사용자가 알림을 활성화한 경우, 푸시 토큰(token), OS 정보, 앱 버전, 언어 정보와 함께 알림 제공에 필요한 주소/해시/txid가 알림 서버로 전송될 수 있습니다.
- 기본 알림 서버: `https://groundcontrol.mobick.info`
- 사용자가 알림을 비활성화했거나, 기기/OS 환경에서 알림 권한이 거부된 경우 해당 정보 전송은 수행되지 않습니다.

### 4) 오류 진단 정보 (Do Not Track 비활성 시)
- 앱 안정성 개선을 위해 Bugsnag를 통해 오류/충돌 로그가 전송될 수 있습니다.
- 이때 기기 고유 식별자(앱 내 고유 ID 설정값 포함)와 오류 진단 정보가 포함될 수 있습니다.
- 사용자가 `Do Not Track`를 활성화하면 해당 진단 정보 전송이 중지됩니다.

## 2. 정보 처리 목적
- 지갑 기능 제공(잔액/거래 조회, 주소 및 트랜잭션 관리)
- 푸시 알림 제공(입금/확인 알림)
- 오류 분석 및 서비스 안정성 개선

## 3. 제3자 제공/처리
앱은 기능 제공을 위해 아래 서비스와 통신할 수 있습니다.
- Bugsnag (오류 진단)
- 푸시 인프라 제공자(예: Google/Apple 푸시 서비스)
- GroundControl 알림 서버 (`groundcontrol.mobick.info`)
- 사용자가 직접 설정한 Electrum/Lightning/기타 외부 서버

각 외부 서비스의 정보 처리는 해당 사업자의 정책이 적용될 수 있습니다.

참고 링크:
- Bugsnag Privacy: `https://www.bugsnag.com/privacy/`
- Firebase Cloud Messaging: `https://firebase.google.com/support/privacy`
- Apple Push Notification service: `https://www.apple.com/legal/privacy/data/en/apple-push-notification-service/`

## 4. 보관 기간 및 파기
- 기기 내 데이터는 사용자가 삭제하거나 앱을 제거할 때까지 보관됩니다.
- 푸시 알림 관련 정보는 사용자가 알림을 비활성화하거나 지갑을 삭제할 때 서버에 해제/삭제 요청이 전송될 수 있습니다.
- 오류 로그 보관 기간은 Bugsnag 정책에 따릅니다.

## 5. 앱 권한
앱은 기능 제공을 위해 다음 권한을 사용할 수 있습니다.
- 카메라(주소/QR 스캔)
- 알림
- 생체인증(앱 잠금/보안 기능)
- 저장소/파일 접근(백업/가져오기/내보내기)
- 네트워크 접근(블록체인 데이터 동기화, 알림)

## 6. 이용자 선택권
- 앱 설정에서 `Do Not Track`를 활성화해 오류 진단 정보 전송을 중지할 수 있습니다.
- 기기 설정 또는 앱 설정에서 푸시 알림을 비활성화할 수 있습니다.
- 지갑 삭제, 앱 데이터 삭제, 앱 제거를 통해 로컬 데이터를 삭제할 수 있습니다.

## 7. 아동의 개인정보
앱은 아동을 대상으로 개인정보를 의도적으로 수집하지 않습니다.

## 8. 개인정보의 국외 이전 가능성
사용 중인 서버/서비스(Bugsnag, 푸시 인프라, 사용자 설정 서버)의 위치에 따라 정보가 국외에서 처리될 수 있습니다.

## 9. 방침 변경
본 방침이 변경될 경우, 본 문서의 시행일을 업데이트하여 고지합니다.

## 10. 문의처
- GitHub: `https://github.com/hogusea`
- Issues: `https://github.com/hogusea/Ishmael/issues`

## 11. 개인정보처리방침 URL
- GitHub 문서: `https://github.com/hogusea/Ishmael/blob/master/PRIVACY_POLICY.md`
- 원문(Play Console 등록 권장): `https://raw.githubusercontent.com/hogusea/Ishmael/master/PRIVACY_POLICY.md`
