# 네트워크 설정 가이드

## 현재 IP 상태 분석

### 1. 현재 네트워크 상태
```bash
# Wi-Fi 네트워크
Wi-Fi IPv4 주소: 192.168.0.34
서브넷 마스크: 255.255.255.0
기본 게이트웨이: 192.168.0.1
네트워크 대역: 192.168.0.0/24

# WSL 네트워크
WSL IPv4 주소: 172.18.32.1
서브넷 마스크: 255.255.240.0
네트워크 대역: 172.18.32.0/20
```

## Docker Desktop 설정

### 1. Docker Desktop 서브넷 설정
```bash
# Docker Desktop → Settings → Resources → Network
Docker Subnet: 192.168.0.0/24
Gateway: 192.168.0.1
```

### 2. 설정 방법
```bash
# Docker Desktop 설정 단계
1. Docker Desktop 실행
2. Settings (톱니바퀴 아이콘) 클릭
3. Resources → Network 클릭
4. Docker Subnet: 192.168.0.0/24 입력
5. Apply & Restart 클릭
```

## MetalLB IP Pool 설정

### 1. 현재 설정 (k8s/base/metallb/ipaddresspool.yaml)
```yaml
apiVersion: metallb.io/v1beta1
kind: IPAddressPool
metadata:
  name: trip-service-pool
  namespace: metallb-system
spec:
  addresses:
  # 👇 현재 네트워크에 맞게 설정 (192.168.0.0/24 대역)
  # Wi-Fi IPv4 주소: 192.168.0.34
  # Docker Desktop - 설정 - Resources - Network - Docker Subnet 192.168.0.0/24
  - 192.168.0.100-192.168.0.110  # 10개 IP 할당
  # 0.100-110 대역은 일반적으로 DHCP가 사용하지 않는 범위
```

### 2. IP 할당 전략
```bash
# IP 할당 범위
192.168.0.100 - 192.168.0.110 (11개 IP)

# 각 서비스별 IP 할당
192.168.0.100 - trip-service.local (메인 도메인)
192.168.0.101 - frontend.trip-service.local
192.168.0.102 - api.trip-service.local
192.168.0.103 - admin.trip-service.local
192.168.0.104 - monitoring.trip-service.local
192.168.0.105 - backup.trip-service.local
```

## Hosts 파일 설정

### 1. Windows Hosts 파일 위치
```bash
# Windows Hosts 파일 경로
C:\Windows\System32\drivers\etc\hosts
```

### 2. Hosts 파일에 추가할 내용
```bash
# Trip Service 로컬 개발환경
192.168.0.100 trip-service.local
192.168.0.101 frontend.trip-service.local
192.168.0.102 api.trip-service.local
192.168.0.103 admin.trip-service.local
192.168.0.104 monitoring.trip-service.local
192.168.0.105 backup.trip-service.local
```

### 3. Hosts 파일 편집 방법
```bash
# 관리자 권한으로 메모장 실행
1. Windows 키 + R
2. notepad 입력
3. Ctrl + Shift + Enter (관리자 권한으로 실행)
4. C:\Windows\System32\drivers\etc\hosts 파일 열기
5. 위의 내용 추가
6. 저장
```

## 네트워크 설정 검증

### 1. Docker Desktop 설정 확인
```bash
# Docker Desktop에서 확인
docker network ls
docker network inspect bridge
```

### 2. MetalLB 설정 확인
```bash
# Kubernetes에서 확인
kubectl get ipaddresspool -n metallb-system
kubectl get l2advertisement -n metallb-system
```

### 3. 서비스 IP 할당 확인
```bash
# 서비스 IP 할당 확인
kubectl get services -n trip-service-dev
kubectl get services -n trip-service-prod
```

## 문제 해결

### 1. IP 충돌 문제
```bash
# 문제: 다른 장치와 IP 충돌
해결: 192.168.0.100-110 범위가 사용 중인지 확인
ping 192.168.0.100
ping 192.168.0.101
# ... (각 IP 확인)
```

### 2. 네트워크 연결 문제
```bash
# 문제: 서비스에 접근할 수 없음
해결: 
1. Docker Desktop 서브넷 설정 확인
2. MetalLB IP Pool 설정 확인
3. Hosts 파일 설정 확인
4. 방화벽 설정 확인
```

### 3. DNS 해석 문제
```bash
# 문제: 도메인 이름으로 접근할 수 없음
해결:
1. Hosts 파일 설정 확인
2. DNS 캐시 초기화
ipconfig /flushdns
```

## 설정 순서

### 1. Docker Desktop 설정
```bash
1. Docker Desktop 실행
2. Settings → Resources → Network
3. Docker Subnet: 192.168.0.0/24
4. Apply & Restart
```

### 2. MetalLB 설정
```bash
1. MetalLB 설치
kubectl apply -f https://raw.githubusercontent.com/metallb/metallb/v0.13.12/config/manifests/metallb-native.yaml

2. IP Pool 설정
kubectl apply -f k8s/base/metallb/ipaddresspool.yaml
```

### 3. Hosts 파일 설정
```bash
1. 관리자 권한으로 메모장 실행
2. C:\Windows\System32\drivers\etc\hosts 파일 열기
3. 도메인 매핑 추가
4. 저장
```

### 4. 서비스 배포
```bash
1. Kubernetes 서비스 배포
kubectl apply -f k8s/

2. 서비스 IP 할당 확인
kubectl get services
```

## 접근 방법

### 1. 로컬 개발환경 접근
```bash
# 브라우저에서 접근
http://trip-service.local
http://frontend.trip-service.local
http://api.trip-service.local
```

### 2. 직접 IP 접근
```bash
# IP로 직접 접근
http://192.168.0.100
http://192.168.0.101
http://192.168.0.102
```

## 주의사항

### 1. IP 충돌 방지
```bash
# 192.168.0.100-110 범위가 다른 장치에서 사용 중인지 확인
# 사용 중인 IP는 MetalLB IP Pool에서 제외
```

### 2. 네트워크 보안
```bash
# 로컬 개발환경이므로 보안 설정 필요
# 프로덕션 환경에서는 별도 보안 설정 필요
```

### 3. 방화벽 설정
```bash
# Windows 방화벽에서 192.168.0.0/24 대역 허용
# 또는 Docker Desktop 방화벽 예외 설정
```

## 결론

현재 IP 상태 (192.168.0.0/24)에 맞게 설정하면:
- ✅ **Docker Desktop**: 192.168.0.0/24 서브넷
- ✅ **MetalLB**: 192.168.0.100-110 IP Pool
- ✅ **Hosts**: 192.168.0.100-105 도메인 매핑

이렇게 설정하면 로컬 개발환경에서 안정적으로 서비스에 접근할 수 있습니다.

