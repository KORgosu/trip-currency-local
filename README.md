# Trip Service Local Development Environment

## 📋 개요
이 프로젝트는 마이크로서비스 아키텍처를 기반으로 한 여행 서비스의 로컬 개발 환경입니다. Kubernetes, Docker, FastAPI, React를 사용하여 구성되었습니다.

> **✨ 업데이트**: Jenkins CI/CD 파이프라인이 EC2 Worker와 IAM Role 기반으로 구성되어 안전하고 효율적인 빌드 환경을 제공합니다.

## 🏗️ 아키텍처
- **Frontend**: React + Vite
- **Backend Services**: FastAPI (Python)
  - Currency Service (환율 서비스)
  - History Service (히스토리 서비스)
  - Ranking Service (랭킹 서비스)
  - Data Ingestor Service (데이터 수집 서비스)
- **Infrastructure**: 
  - MySQL (메인 데이터베이스)
  - MongoDB (문서 데이터베이스)
  - Redis (캐시)
  - Kafka (메시지 큐)
  - Zookeeper (Kafka 코디네이터)

## 🚀 초기 개발 환경 구성 설정

### 사전 준비사항
1. **현재 IP 확인**
   ```bash
   ipconfig
   ```

2. **MetalLB IP Pool 설정**
   - `k8s/base/metallb/ipaddresspool.yaml` 파일의 `spec:addresses` 부분을 본인 IP 대역으로 변경
   - 예: `192.168.203.100-192.168.203.110`

3. **Docker Desktop 설정 변경**
   - Docker Desktop → Settings → Resources → Network
   - Subnet을 본인 IP 대역에 맞게 변경 (예: `192.168.203.0/24`)
   - "Enable Host Networking" 체크

## 📝 단계별 배포 가이드

### 1단계: Docker Desktop 클러스터 상태 확인
```bash
kubectl get nodes
```

### 2단계: 기존 네임스페이스 확인
```bash
kubectl get namespaces
```

### 3단계: MetalLB 설치 확인
```bash
kubectl get namespaces | Select-String -Pattern "metallb"
```

### 4단계: MetalLB 설치
```bash
kubectl apply -f https://raw.githubusercontent.com/metallb/metallb/v0.13.12/config/manifests/metallb-native.yaml
```

### 5단계: MetalLB 준비 대기
```bash
kubectl wait --namespace metallb-system --for=condition=ready pod --selector=app=metallb --timeout=90s
```

### 6단계: MetalLB IP Pool 설정
```bash
kubectl apply -f k8s/base/metallb/ipaddresspool.yaml
```

### 7단계: Nginx Ingress Controller 설치
```bash
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.8.2/deploy/static/provider/cloud/deploy.yaml
```

### 8단계: Ingress Controller 준비 대기
```bash
kubectl wait --namespace ingress-nginx --for=condition=ready pod --selector=app.kubernetes.io/component=controller --timeout=90s
```

### 9단계: 네임스페이스 생성
```bash
kubectl create namespace trip-service-dev
```

### 10단계: Secrets 생성
```bash
cd k8s/base
kubectl apply -f secrets.yaml -n trip-service-dev
```

### 11단계: ConfigMap 생성
```bash
kubectl apply -f configmap.yaml -n trip-service-dev
```

### 12단계: 인프라 서비스 배포
```bash
# 데이터베이스 서비스
kubectl apply -k mysql/ -n trip-service-dev
kubectl apply -k mongodb/ -n trip-service-dev
kubectl apply -k redis/ -n trip-service-dev

# 메시지 큐 (Kafka, Zookeeper)
kubectl apply -k kafka/ -n trip-service-dev

# 인프라 컨테이너 상태 확인 (모두 Running까지 대기)
kubectl get pods -n trip-service-dev
```

### 12.5단계: 인프라 서비스 준비 대기
```bash
# MySQL 준비 대기
kubectl wait --for=condition=ready pod -l app=mysql -n trip-service-dev --timeout=300s

# MongoDB 준비 대기
kubectl wait --for=condition=ready pod -l app=mongodb -n trip-service-dev --timeout=300s

# Redis 준비 대기
kubectl wait --for=condition=ready pod -l app=redis -n trip-service-dev --timeout=300s

# Kafka 준비 대기
kubectl wait --for=condition=ready pod -l app=kafka -n trip-service-dev --timeout=300s
```

### 13단계: 이미지 빌드
```bash
# 프로젝트 루트 디렉토리에서 수행
cd C:\mini_project\trip-service-local

# 최초 이미지 빌드
docker build -f frontend/Dockerfile -t trip-service/service-frontend:dev-latest .
docker build -f service-currency/Dockerfile -t trip-service/service-currency:dev-latest .
docker build -f service-history/Dockerfile -t trip-service/service-history:dev-latest .
docker build -f service-ranking/Dockerfile -t trip-service/service-ranking:dev-latest .
docker build -f service-dataingestor/Dockerfile -t trip-service/service-dataingestor:dev-latest .

# latest 태그 생성
docker tag trip-service/service-frontend:dev-latest trip-service/service-frontend:latest
docker tag trip-service/service-currency:dev-latest trip-service/service-currency:latest
docker tag trip-service/service-history:dev-latest trip-service/service-history:latest
docker tag trip-service/service-ranking:dev-latest trip-service/service-ranking:latest
docker tag trip-service/service-dataingestor:dev-latest trip-service/service-dataingestor:latest

# 빌드된 이미지 확인
docker images | grep trip-service
```

### 14단계: 애플리케이션 서비스 배포
```bash
cd k8s/base

# 서비스들 배포 (의존성 순서) - 각 파드가 Running 1/1이 되는 것을 확인 후 다음 단계 진행
kubectl apply -k services/currency-service/ -n trip-service-dev
kubectl apply -k services/history-service/ -n trip-service-dev
kubectl apply -k services/ranking-service/ -n trip-service-dev
kubectl apply -k services/dataingestor-service/ -n trip-service-dev
kubectl apply -k services/frontend/ -n trip-service-dev

# 서비스들 준비 대기
kubectl wait --for=condition=ready pod -l app=service-currency -n trip-service-dev --timeout=300s
kubectl wait --for=condition=ready pod -l app=service-history -n trip-service-dev --timeout=300s
kubectl wait --for=condition=ready pod -l app=service-ranking -n trip-service-dev --timeout=300s
kubectl wait --for=condition=ready pod -l app=service-frontend -n trip-service-dev --timeout=300s

# CronJob 상태 확인
kubectl get cronjobs -n trip-service-dev
```

### 15단계: Ingress 설정
```bash
# Windows hosts 파일에 추가 (관리자 권한 필요)
# C:\Windows\System32\drivers\etc\hosts
# 192.168.203.200 trip-service.local
# 192.168.203.200 api.trip-service.local

# Ingress 리소스 적용
kubectl apply -f ingress/ -n trip-service-dev

# Ingress 상태 확인
kubectl get ingress -n trip-service-dev

# Ingress Controller External IP 확인
kubectl get services -n ingress-nginx
```

### 16단계: 서비스 상태 확인
```bash
# 전체 리소스 상태 확인
kubectl get all -n trip-service-dev

# Pod 상태 확인
kubectl get pods -n trip-service-dev

# 서비스 상태 확인 (LoadBalancer IP 포함)
kubectl get services -n trip-service-dev -o wide

# MetalLB IP 할당 확인
kubectl get services -n trip-service-dev | grep LoadBalancer

# 각 서비스 로그 확인
kubectl logs -l app=service-currency -n trip-service-dev --tail=10
kubectl logs -l app=service-history -n trip-service-dev --tail=10
kubectl logs -l app=service-ranking -n trip-service-dev --tail=10
kubectl logs -l app=service-frontend -n trip-service-dev --tail=10
```

### 17단계: 서비스 연결성 테스트
```bash
# 내부 서비스 연결성 테스트
kubectl run test-pod --image=curlimages/curl -i --tty --rm -n trip-service-dev -- sh

# 테스트 pod 내에서 실행:
# curl http://service-currency:8000/health
# curl http://service-history:8000/health
# curl http://service-ranking:8000/health
```

### 18단계: 외부 접근 확인
```bash
curl http://trip-service.local
curl http://api.trip-service.local/currency/health
curl http://api.trip-service.local/history/health
curl http://api.trip-service.local/ranking/health
curl http://api.trip-service.local/rankings
```

### 19단계: 데이터베이스 초기화 확인
```bash
# 데이터베이스 초기화 스크립트 실행 확인
kubectl logs -l app=mysql -n trip-service-dev | grep -i "initialization\|ready"

# MongoDB 초기화 확인
kubectl logs -l app=mongodb -n trip-service-dev | grep -i "initialization\|ready"
```

### 20단계: 전체 시스템 헬스체크
```bash
kubectl run health-check --image=curlimages/curl -i --tty --rm -n trip-service-dev -- sh

# 테스트 pod 내에서 실행:
# curl http://service-currency:8000/health
# curl http://service-history:8000/health  
# curl http://service-ranking:8000/health
# curl http://service-frontend:3000/health
```

## 🔧 운영 및 관리

### 파드 재시작
```bash
kubectl rollout restart deployment/service-currency -n trip-service-dev
kubectl rollout restart deployment/service-history -n trip-service-dev
kubectl rollout restart deployment/service-ranking -n trip-service-dev
kubectl rollout restart deployment/service-frontend -n trip-service-dev
```

### 상태 확인 명령어
```bash
# Pod 상세 정보 확인
kubectl describe pod -l app=service-currency -n trip-service-dev

# 특정 Pod 로그 확인
kubectl logs <pod-name> -n trip-service-dev

# 이벤트 확인
kubectl get events -n trip-service-dev --sort-by='.lastTimestamp'

# 리소스 사용량 확인 (metrics-server 설치 시)
kubectl top pods -n trip-service-dev
```

### 데이터 수집 서비스 확인
```bash
# Data Ingestor 구동 확인
kubectl get pods | Select-String -Pattern "dataingestor"

# Data Ingestor 로그 확인
kubectl logs dataingestor-service-7cb57d44dc-2dt9h --tail=50
```

### 데이터베이스 데이터 확인
```bash
# MySQL 데이터 확인
kubectl exec -it mysql-758c6d4c7-5wkrw -- mysql -u root -ptrip-service-root -e "USE currency_db; SELECT COUNT(*) as total_records FROM exchange_rate_history;"

# Redis 캐시 확인
kubectl exec -it redis-6d95787666-mr892 -- redis-cli KEYS "*"

# 통화별 해싱 데이터 확인
kubectl exec -it redis-6d95787666-mr892 -- redis-cli HGETALL "rate:CurrencyCode.USD"
```

## 🌐 접속 URL
- **Frontend**: `http://trip-service.local/`
- **API**: `http://api.trip-service.local/`
- **Kafka UI**: `http://kafka-ui.trip-service.local/`
- **ArgoCD**: `http://argocd.trip-service.local/`

## 📁 프로젝트 구조
```
trip-service-local/
├── frontend/                 # React 프론트엔드
├── service-currency/        # 환율 서비스
├── service-history/         # 히스토리 서비스
├── service-ranking/         # 랭킹 서비스
├── service-dataingestor/    # 데이터 수집 서비스
├── package-shared/          # 공유 패키지
├── k8s/                     # Kubernetes 설정
│   ├── base/               # 기본 설정
│   └── overlays/           # 환경별 오버레이
├── scripts/                # 초기화 스크립트
└── textures/               # 텍스처 파일
```

## 🐛 문제 해결
1. **네트워크 연결 문제**: Docker Desktop 네트워크 설정 확인
2. **Pod 시작 실패**: 로그 확인 및 환경 변수 검증
3. **Ingress 접속 불가**: MetalLB IP Pool 및 Hosts 파일 확인
4. **데이터베이스 연결 실패**: Secrets 및 ConfigMap 확인

## 📞 지원
문제가 발생하면 다음을 확인하세요:
- Pod 로그: `kubectl logs <pod-name> -n trip-service-dev`
- 이벤트: `kubectl get events -n trip-service-dev`
- 서비스 상태: `kubectl get all -n trip-service-dev`

# Jenkins 빌드 테스트 - Jenkins credentials 강제 업데이트 후 테스트
