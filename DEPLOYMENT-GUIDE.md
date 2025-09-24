# Trip Service 개발 환경 배포 가이드

## 📋 배포 전 체크리스트

### ✅ 완료된 항목들
- [x] Frontend 빌드 설정 완료
- [x] 백엔드 서비스 포트 통일 (8000)
- [x] 데이터베이스 연결 설정 완료
- [x] Kafka 토픽 설정 완료
- [x] Health Check 강화 완료
- [x] k8s 기본 설정 완료
- [x] Dockerfile 경로 수정 완료
- [x] dev 환경 설정 파일 생성 완료
- [x] 공유 패키지 의존성 수정 완료

## 🚀 배포 단계

### 1. Docker 이미지 빌드

#### Windows (PowerShell)
```powershell
# 모든 서비스 이미지 빌드
.\scripts\build-images.ps1

# 특정 태그로 빌드
.\scripts\build-images.ps1 -Tag "v1.0.0" -Registry "my-registry"
```

#### Linux/macOS (Bash)
```bash
# 실행 권한 부여
chmod +x scripts/build-images.sh

# 모든 서비스 이미지 빌드
./scripts/build-images.sh

# 특정 태그로 빌드
./scripts/build-images.sh v1.0.0 my-registry
```

### 2. 쿠버네티스 배포

```bash
# dev 환경 배포
kubectl apply -k k8s/overlays/dev

# 배포 상태 확인
kubectl get pods -n trip-service-dev

# 서비스 상태 확인
kubectl get services -n trip-service-dev

# Ingress 상태 확인
kubectl get ingress -n trip-service-dev
```

### 3. 로컬 네트워크 설정

#### Windows (hosts 파일)
```
# C:\Windows\System32\drivers\etc\hosts 파일에 추가
192.168.201.100 dev.trip-service.local
192.168.201.100 api-dev.trip-service.local
```

#### Linux/macOS (hosts 파일)
```
# /etc/hosts 파일에 추가
192.168.201.100 dev.trip-service.local
192.168.201.100 api-dev.trip-service.local
```

### 4. 접속 확인

- **Frontend**: http://dev.trip-service.local
- **API**: http://api-dev.trip-service.local
- **Kafka UI**: http://kafka-ui.trip-service.local

## 🔧 문제 해결

### 일반적인 문제들

#### 1. 이미지 빌드 실패
```bash
# Docker 빌드 컨텍스트 확인
docker build --no-cache -f service-currency/Dockerfile .

# 공유 패키지 설치 확인
cd package-shared
pip install -e .
```

#### 2. Pod 시작 실패
```bash
# Pod 로그 확인
kubectl logs -n trip-service-dev <pod-name>

# Pod 상세 정보 확인
kubectl describe pod -n trip-service-dev <pod-name>

# 이벤트 확인
kubectl get events -n trip-service-dev --sort-by='.lastTimestamp'
```

#### 3. 서비스 연결 실패
```bash
# 서비스 엔드포인트 확인
kubectl get endpoints -n trip-service-dev

# 네트워크 정책 확인
kubectl get networkpolicies -n trip-service-dev

# DNS 확인
kubectl run -it --rm debug --image=busybox --restart=Never -- nslookup mysql-service
```

#### 4. 데이터베이스 연결 실패
```bash
# MySQL 연결 테스트
kubectl run -it --rm mysql-client --image=mysql:8.0 --restart=Never -- mysql -h mysql-service -u trip_user -p

# Redis 연결 테스트
kubectl run -it --rm redis-client --image=redis:7-alpine --restart=Never -- redis-cli -h redis-service

# MongoDB 연결 테스트
kubectl run -it --rm mongo-client --image=mongo:7 --restart=Never -- mongosh mongodb://admin:password@mongodb-service:27017/currency_db
```

## 📊 모니터링

### 헬스체크 확인
```bash
# 모든 서비스 헬스체크
kubectl get pods -n trip-service-dev -o wide

# 특정 서비스 헬스체크
curl http://api-dev.trip-service.local/currency/health
curl http://api-dev.trip-service.local/history/health
curl http://api-dev.trip-service.local/ranking/health
```

### 로그 확인
```bash
# 실시간 로그 확인
kubectl logs -f -n trip-service-dev deployment/currency-service
kubectl logs -f -n trip-service-dev deployment/history-service
kubectl logs -f -n trip-service-dev deployment/ranking-service
kubectl logs -f -n trip-service-dev deployment/dataingestor-service
```

### 리소스 사용량 확인
```bash
# Pod 리소스 사용량
kubectl top pods -n trip-service-dev

# 노드 리소스 사용량
kubectl top nodes
```

## 🧹 정리

### 배포 제거
```bash
# dev 환경 제거
kubectl delete -k k8s/overlays/dev

# 네임스페이스 제거
kubectl delete namespace trip-service-dev
```

### 이미지 정리
```bash
# 로컬 이미지 정리
docker rmi $(docker images "trip-service/*" -q)

# 사용하지 않는 이미지 정리
docker image prune -a
```

## 📝 추가 정보

### 환경 변수
- `ENVIRONMENT`: development
- `LOG_LEVEL`: DEBUG
- `MOCK_DATA_ENABLED`: true
- `CACHE_TTL`: 300 (5분)

### 포트 정보
- Frontend: 80
- Currency Service: 8000
- History Service: 8000
- Ranking Service: 8000
- Data Ingestor Service: 8000
- MySQL: 3306
- MongoDB: 27017
- Redis: 6379
- Kafka: 9092

### 네임스페이스
- `trip-service-dev`: 개발 환경

### 도메인
- `dev.trip-service.local`: Frontend
- `api-dev.trip-service.local`: API 서비스들
- `kafka-ui.trip-service.local`: Kafka UI
