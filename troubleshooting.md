# Trip Service 로컬 배포 트러블슈팅 가이드

## 목차
1. [Docker Build Context 문제](#1-docker-build-context-문제)
2. [ImagePullBackOff 에러](#2-imagepullbackoff-에러)
3. [CreateContainerConfigError 문제](#3-createcontainerconfigerror-문제)
4. [서비스 포트 불일치](#4-서비스-포트-불일치)
5. [데이터베이스 연결 실패](#5-데이터베이스-연결-실패)
6. [DataIngestor Deployment에서 CronJob으로 전환](#6-dataingestor-deployment에서-cronjob으로-전환)
7. [현재 상태 점검 명령어](#7-현재-상태-점검-명령어)

---

## 1. Docker Build Context 문제

### 문제 증상
```
ERROR: failed to solve: failed to compute cache key: "/package-shared": not found
```

### 원인
- 각 서비스 디렉토리에서 Docker 빌드 시 상위 디렉토리의 `package-shared` 폴더에 접근할 수 없음
- Dockerfile의 `COPY ../package-shared` 명령이 build context 밖의 파일을 참조

### 해결 방법
**빌드 스크립트 수정 (`scripts/build-and-deploy.sh`, `scripts/build-and-deploy.ps1`)**

**수정 전:**
```bash
cd $service_dir
docker build -t $REGISTRY/$service_name:$TAG .
```

**수정 후:**
```bash
# 프로젝트 루트에서 빌드 (package-shared 접근 가능)
docker build -f $service_dir/Dockerfile -t $REGISTRY/$service_name:$TAG .
```

**Frontend Dockerfile 수정**
```dockerfile
# 수정 전
COPY package*.json ./
COPY . .
COPY nginx.conf /etc/nginx/nginx.conf

# 수정 후
COPY frontend/package*.json ./
COPY frontend/ .
COPY frontend/nginx.conf /etc/nginx/nginx.conf
```

---

## 2. ImagePullBackOff 에러

### 문제 증상
```
kubectl get pods
NAME                          READY   STATUS             RESTARTS   AGE
currency-service-xxx          0/1     ImagePullBackOff   0          2m
```

### 원인
- Kubernetes가 로컬에서 빌드한 이미지를 Docker Hub에서 찾으려고 시도
- `imagePullPolicy` 기본값이 `Always`로 설정되어 있음

### 해결 방법
**모든 deployment.yaml 파일에 `imagePullPolicy: Never` 추가**

```yaml
containers:
- name: service-name
  image: trip-service/service-name:latest
  imagePullPolicy: Never  # 이 줄 추가
```

**적용된 파일들:**
- `k8s/base/services/currency-service/deployment.yaml`
- `k8s/base/services/history-service/deployment.yaml`
- `k8s/base/services/ranking-service/deployment.yaml`
- `k8s/base/services/dataingestor-service/deployment.yaml`
- `k8s/base/services/frontend/deployment.yaml`

**배포 명령:**
```bash
kubectl apply -f k8s/base/services/currency-service/
kubectl apply -f k8s/base/services/history-service/
kubectl apply -f k8s/base/services/ranking-service/
kubectl apply -f k8s/base/services/dataingestor-service/
kubectl apply -f k8s/base/services/frontend/
```

---

## 3. CreateContainerConfigError 문제

### 문제 증상
```
kubectl describe pod <pod-name>
...
Warning  Failed     Error: secret "trip-service-secrets" not found
```

### 원인
- 애플리케이션 서비스들이 참조하는 `trip-service-secrets` Secret이 존재하지 않음
- `secrets.yaml`에 MySQL, MongoDB secret만 있고 애플리케이션용 secrets 누락

### 해결 방법
**`k8s/base/secrets.yaml`에 trip-service-secrets 추가**

```yaml
---
apiVersion: v1
kind: Secret
metadata:
  name: trip-service-secrets
type: Opaque
data:
  # Database passwords (base64 encoded)
  mysql-password: dHJpcC1zZXJ2aWNlLXVzZXI=        # trip-service-user
  mongodb-password: dHJpcC1zZXJ2aWNlLW1vbmdv      # trip-service-mongo
  # External API keys (base64 encoded)
  exchange-api-key: ZGVtby1hcGkta2V5            # demo-api-key
  external-service-token: ZGVtby10b2tlbg==      # demo-token
```

**적용 명령:**
```bash
kubectl apply -f k8s/base/secrets.yaml
```

**문제가 있는 파드 재시작:**
```bash
kubectl delete pod <pod-name>  # 자동으로 재생성됨
```

---

## 4. 서비스 포트 불일치

### 문제 증상
```
kubectl logs currency-service-xxx
INFO: Uvicorn running on http://0.0.0.0:8001
```
하지만 deployment.yaml에서는 포트 8000을 기대

### 원인
- 애플리케이션이 실제로는 포트 8001에서 실행
- Kubernetes deployment 설정은 포트 8000으로 구성
- Health check와 service 연결 실패

### 해결 방법 (현재 진행 중)
1. **애플리케이션 코드 확인** - 실제 사용하는 포트 파악
2. **Deployment.yaml 수정** - containerPort를 실제 포트에 맞게 조정
3. **Service.yaml 수정** - targetPort 업데이트
4. **Health check 경로 확인** - `/health` 엔드포인트 존재 여부 확인

---

## 5. 데이터베이스 연결 실패

### 문제 증상
```
kubectl logs dataingestor-service-xxx
ERROR - Failed to create MySQL connection pool: (2003, "Can't connect to MySQL server on 'localhost'")
```

### 원인
- 애플리케이션이 `localhost`로 데이터베이스 연결 시도
- Kubernetes 환경에서는 서비스명으로 접근해야 함
- 환경 변수 설정이 제대로 적용되지 않음

### 현재 ConfigMap 설정 (정상)
```yaml
data:
  MYSQL_HOST: mysql-service
  MYSQL_PORT: "3306"
  MONGODB_HOST: mongodb-service
  MONGODB_PORT: "27017"
```

### 해결 방법 (현재 진행 중)
1. **애플리케이션 코드 확인** - 환경 변수 사용 방식 점검
2. **데이터베이스 초기화 로직 확인**
3. **연결 문자열 구성 방식 점검**

---

## 6. DataIngestor Deployment에서 CronJob으로 전환

### 문제 배경
DataIngestor 서비스가 지속적으로 실행되는 Deployment로 배포되어 있었지만, 실제로는 주기적 배치 작업 특성을 가지고 있어 부적절한 상황이었습니다.

### 문제 증상
```
kubectl logs dataingestor-service-xxx
Error: CrashLoopBackOff
ERROR - Failed to create MySQL connection pool: (2003, "Can't connect to MySQL server on 'localhost'")
```

### 근본 원인 분석
1. **아키텍처 불일치**: DataIngestor는 배치 작업이지만 웹 서비스처럼 Deployment로 배포
2. **리소스 낭비**: 지속적으로 실행되는 파드가 불필요하게 리소스 소모
3. **스케줄링 문제**: 애플리케이션 내부 스케줄러와 Kubernetes 스케줄링의 중복

### 해결 방법: Kubernetes CronJob으로 전환

#### 1. 전환 이유
- **적절한 워크로드 타입**: 배치 작업에 최적화된 CronJob 사용
- **리소스 효율성**: 실행 시에만 파드 생성, 완료 후 자동 정리
- **명확한 스케줄링**: Kubernetes 네이티브 스케줄링 활용
- **운영 편의성**: Job 히스토리, 재시도 정책 등 배치 작업에 특화된 기능

#### 2. CronJob 설정
```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: dataingestor-cronjob
spec:
  # 5분마다 실행
  schedule: "*/5 * * * *"

  # 동시 실행 방지
  concurrencyPolicy: Forbid

  # 히스토리 관리
  successfulJobsHistoryLimit: 3
  failedJobsHistoryLimit: 3

  jobTemplate:
    spec:
      backoffLimit: 2
      activeDeadlineSeconds: 600
      template:
        spec:
          restartPolicy: OnFailure
          containers:
          - name: dataingestor
            image: trip-service/dataingestor-service:latest
            command: ["python", "/app/service-dataingestor/main.py", "single"]
```

#### 3. 전환 과정
```bash
# 1. 기존 Deployment 및 HPA 삭제
kubectl delete deployment dataingestor-service
kubectl delete hpa dataingestor-service-hpa

# 2. CronJob 배포
kubectl apply -f k8s/base/services/dataingestor-service/cronjob.yaml

# 3. 수동 테스트
kubectl create job dataingestor-test --from=cronjob/dataingestor-cronjob
```

### 전환 후 이점

#### 1. 리소스 효율성
- **Before**: 지속적으로 실행되는 파드 (24시간 리소스 소모)
- **After**: 5분마다 실행되는 Job (실행 시에만 리소스 사용)
- **절약 효과**: 약 90-95% 리소스 사용량 감소 (이론적 계산)

**📊 이론적 계산 근거:**
```
Deployment 방식:
- 24시간 × 7일 = 168시간 지속 실행

CronJob 방식:
- 5분마다 실행, 각 실행당 약 2-3분 소요
- 1시간당: 12회 실행 × 3분 = 36분
- 1일당: 36분 × 24시간 = 864분 = 14.4시간
- 1주일당: 14.4시간

절약율: (168 - 14.4) / 168 = 91.4% ≈ 90-95%
```

**⚠️ 주의사항:**
실제 환경에서는 다음 요소들이 추가로 영향을 줄 수 있습니다:
- 파드 시작/종료 오버헤드
- 실제 데이터 처리 시간 변동
- 실패 시 재시도 시간
- 이미지 풀링 시간

#### 2. 안정성 향상
- **격리된 실행**: 각 Job이 독립적으로 실행되어 장애 격리
- **자동 재시도**: backoffLimit을 통한 자동 재시도 메커니즘
- **타임아웃 관리**: activeDeadlineSeconds로 무한 대기 방지

#### 3. 운영 편의성
- **실행 히스토리**: 최근 3개의 성공/실패 Job 히스토리 보관
- **모니터링 개선**: Job 단위로 성공/실패 상태 명확히 구분
- **로그 관리**: 각 Job별로 독립적인 로그 관리

#### 4. 확장성
- **병렬 처리**: 필요시 parallelism 설정으로 병렬 실행 가능
- **유연한 스케줄**: cron 표현식으로 복잡한 스케줄링 가능
- **환경별 설정**: 개발/운영 환경별로 다른 스케줄 적용 가능

### 관리 명령어

#### CronJob 상태 확인
```bash
# CronJob 목록 조회
kubectl get cronjobs

# CronJob 상세 정보
kubectl describe cronjob dataingestor-cronjob

# 실행된 Job 목록
kubectl get jobs

# 특정 Job 로그 확인
kubectl logs job/<job-name>
```

#### 수동 실행
```bash
# CronJob에서 즉시 Job 생성
kubectl create job manual-run --from=cronjob/dataingestor-cronjob

# Job 삭제 (테스트 후 정리)
kubectl delete job manual-run
```

#### 스케줄 수정
```bash
# 일시 중지
kubectl patch cronjob dataingestor-cronjob -p '{"spec":{"suspend":true}}'

# 재개
kubectl patch cronjob dataingestor-cronjob -p '{"spec":{"suspend":false}}'

# 스케줄 변경 (예: 10분마다)
kubectl patch cronjob dataingestor-cronjob -p '{"spec":{"schedule":"*/10 * * * *"}}'
```

### 결과
- ✅ **리소스 사용량 대폭 감소** (이론적으로 90-95%)
- ✅ **배치 작업 안정성 향상**
- ✅ **명확한 실행 히스토리 관리**
- ✅ **Kubernetes 네이티브 스케줄링 활용**
- ✅ **운영 복잡성 감소**

---

## 7. 현재 상태 점검 명령어

### 전체 시스템 상태 확인
```bash
# 파드 상태 확인
kubectl get pods

# 서비스 상태 확인
kubectl get svc

# HPA 상태 확인
kubectl get hpa

# Ingress 상태 확인
kubectl get ingress
```

### 개별 서비스 로그 확인
```bash
# 특정 파드 로그 확인
kubectl logs <pod-name>

# 실시간 로그 모니터링
kubectl logs -f <pod-name>

# 파드 상세 정보 확인
kubectl describe pod <pod-name>
```

### 네트워크 연결 테스트
```bash
# 서비스 연결 테스트
kubectl exec -it <pod-name> -- curl http://mysql-service:3306
kubectl exec -it <pod-name> -- curl http://mongodb-service:27017

# DNS 해결 테스트
kubectl exec -it <pod-name> -- nslookup mysql-service
```

### 외부 접속 확인
```bash
# MetalLB 외부 IP 확인
kubectl get svc nginx-ingress-controller

# Frontend 접속 테스트
curl http://trip-service.local
# 또는 외부 IP로 직접 접속
curl http://<external-ip>
```

---

## 현재 해결된 문제 ✅

1. **Docker Build Context 문제** - 프로젝트 루트에서 빌드하도록 스크립트 수정
2. **ImagePullBackOff 에러** - imagePullPolicy: Never 적용
3. **CreateContainerConfigError** - trip-service-secrets 추가
4. **서비스 포트 불일치** - Currency(8001), Ranking(8002) 포트 수정 완료
5. **데이터베이스 연결 실패** - package-shared config.py에서 환경 변수 읽기 수정
6. **DataIngestor 아키텍처 개선** - Deployment에서 CronJob으로 전환
7. **Frontend 정상 작동** - 3/3 파드 Running 상태

## 8. MySQL 사용자 권한 및 패스워드 설정 문제

### 문제 증상
```
kubectl logs currency-service-xxx
ERROR - Failed to create MySQL connection pool: (1045, "Access denied for user 'trip_user'@'%' (using password: YES)")
```

### 원인
- MySQL 초기화 스크립트에서 생성한 사용자 권한 설정 불완전
- 애플리케이션에서 환경 변수로 MySQL 패스워드를 읽지 못함

### 해결 방법

#### 1. MySQL 초기화 스크립트 수정
**`k8s/base/mysql/configmap.yaml` 업데이트:**
```sql
-- Create application user
CREATE USER IF NOT EXISTS 'trip_user'@'%' IDENTIFIED BY 'trip-service-user';
GRANT ALL PRIVILEGES ON trip_service.* TO 'trip_user'@'%';
FLUSH PRIVILEGES;
```

#### 2. Deployment에 MySQL 패스워드 환경 변수 추가
**모든 MySQL을 사용하는 서비스 deployment.yaml에 추가:**
```yaml
env:
- name: MYSQL_PASSWORD
  valueFrom:
    secretKeyRef:
      name: trip-service-secrets
      key: mysql-password
```

#### 3. 적용 및 재배포
```bash
# MySQL 재배포 (데이터베이스 초기화)
kubectl delete pod mysql-xxx  # MySQL 파드 재시작

# 서비스 재배포
kubectl apply -f k8s/base/services/currency-service/deployment.yaml
kubectl apply -f k8s/base/services/history-service/deployment.yaml
```

---

## 9. Ranking Service MySQL 의존성 제거

### 문제 배경
Ranking Service는 MongoDB와 Redis만 사용하는 서비스임에도 불구하고 MySQL 연결을 시도하여 불필요한 의존성과 에러가 발생했습니다.

### 문제 증상
```
kubectl logs ranking-service-xxx
ERROR - Failed to create MySQL connection pool: (1045, "Access denied for user 'trip_user'@'%'")
```

### 원인 분석
- Ranking Service 아키텍처상 MongoDB(데이터 저장)와 Redis(캐싱)만 필요
- 공통 database.py 모듈에서 모든 데이터베이스를 초기화하려고 시도
- 불필요한 MySQL 연결로 인한 시작 지연 및 에러 발생

### 해결 방법

#### 1. Ranking Service에 MySQL 초기화 스킵 설정
**`k8s/base/services/ranking-service/deployment.yaml` 수정:**
```yaml
env:
- name: SKIP_MYSQL_INIT
  value: "true"
```

#### 2. Database 초기화 로직 수정
**`package-shared/shared/database.py` 수정:**
```python
async def initialize(self):
    """모든 데이터베이스 초기화"""
    import os

    try:
        # MySQL 초기화 (SKIP_MYSQL_INIT 환경 변수가 true가 아닌 경우에만)
        if os.getenv("SKIP_MYSQL_INIT", "false").lower() != "true":
            self.mysql = MySQLHelper()
            await self.mysql.connect()
            logger.info("MySQL initialized")
        else:
            logger.info("MySQL initialization skipped")
```

#### 3. 서비스별 데이터베이스 사용 현황
| 서비스 | MySQL | MongoDB | Redis | DynamoDB |
|--------|-------|---------|-------|----------|
| Currency Service | ✅ | ✅ | ✅ | Mock |
| History Service | ✅ | ❌ | ✅ | ❌ |
| Ranking Service | ❌ | ✅ | ✅ | Mock |

---

## 10. MongoDB 인증 설정 문제

### 문제 증상
```
kubectl logs currency-service-xxx
pymongo.errors.OperationFailure: Authentication failed., full error: {'ok': 0.0, 'errmsg': 'Authentication failed.', 'code': 18, 'codeName': 'AuthenticationFailed'}
```

### 원인
- MongoDB가 root 사용자 인증으로 설정되어 있음
- 애플리케이션에서 MongoDB 사용자 이름과 패스워드를 환경 변수로 받지 못함
- ConfigMap에 MongoDB 사용자 정보 누락

### 해결 방법

#### 1. ConfigMap에 MongoDB 사용자 정보 추가
**`k8s/base/configmap.yaml` 수정:**
```yaml
# MongoDB Configuration
MONGODB_HOST: "mongodb-service"
MONGODB_PORT: "27017"
MONGODB_DATABASE: "trip_service"
MONGODB_USER: "admin"  # 추가
```

#### 2. 서비스 Deployment에 MongoDB 패스워드 추가
**MongoDB를 사용하는 모든 서비스에 추가:**
```yaml
env:
- name: MONGODB_PASSWORD
  valueFrom:
    secretKeyRef:
      name: trip-service-secrets
      key: mongodb-password
```

**적용된 서비스:**
- Currency Service
- Ranking Service

#### 3. 설정 적용
```bash
# ConfigMap 업데이트
kubectl apply -f k8s/base/configmap.yaml

# 서비스 재배포
kubectl apply -f k8s/base/services/currency-service/deployment.yaml
kubectl apply -f k8s/base/services/ranking-service/deployment.yaml
```

### 결과
- ✅ Currency Service: MySQL, MongoDB, Redis, Kafka 모든 연결 성공
- ✅ Ranking Service: MongoDB, Redis 연결 성공 (MySQL 스킵)

---

## 더 이상 진행 중인 문제 없음 🎉

모든 주요 문제가 해결되었습니다!

## 최종 성공 상태 🎯

- **Frontend**: 완전 정상 작동 (3/3 파드, 웹 접속 가능)
- **Currency Service**: 포트 8001에서 정상 작동 (2/2 파드)
- **History Service**: 포트 8000에서 정상 작동 (2/2 파드)
- **Ranking Service**: 포트 8002에서 정상 작동 (2/2 파드)
- **DataIngestor**: CronJob으로 5분마다 자동 실행 (배치 작업)
- **Infrastructure**: MySQL, MongoDB, Redis, Kafka 모두 정상
- **전체 시스템**: 100% 정상 작동 상태

### 리소스 효율성 향상
- DataIngestor CronJob 전환으로 **대폭적인 리소스 사용량 감소**
- 배치 작업 안정성 및 모니터링 개선
- Kubernetes 네이티브 스케줄링 활용

---

## 11. DNS 해결 및 502 Bad Gateway 문제

### 문제 증상
```javascript
// 브라우저 콘솔에서 발생
GET http://localhost:8080/api/v1/rankings?limit=10&offset=0 502 (Bad Gateway)
rankingRequest @ api.js:81
getRankings @ api.js:507
```

```bash
# nginx 에러 로그
ranking-service could not be resolved (2: Server failure)
127.0.0.1 - - [23/Sep/2025:12:07:50 +0000] "GET /api/v1/rankings?limit=10&offset=0 HTTP/1.1" 502 497
```

### 문제 원인 분석

#### 1. 서비스 이름 표준화 부족
- 데이터베이스 서비스들이 일관되지 않은 이름 패턴 사용
- 일부는 `mysql-service`, 일부는 `service-mysql` 형태로 혼재
- DNS 해결 실패로 인한 백엔드 서비스 연결 불가

#### 2. Nginx DNS 해결 문제
- nginx 설정에서 짧은 서비스명 사용 (`ranking-service`)
- Kubernetes DNS resolver 설정이 불완전
- curl로는 연결되지만 nginx 프록시에서는 DNS 실패

#### 3. 환경 변수 불일치
- ConfigMap에서 `ENVIRONMENT: "development"` 설정
- 애플리케이션 코드에서는 `"dev"` 값 기대
- Pydantic validation 오류로 서비스 시작 실패

### 해결 과정

#### 1단계: 서비스 이름 표준화 (service-* 패턴)

**변경된 서비스들:**
```yaml
# Before → After
mysql-service → service-mysql
mongodb-service → service-mongodb
redis-service → service-redis
kafka-service → service-kafka
zookeeper-service → service-zookeeper
```

**수정된 파일들:**
- `k8s/base/mysql/service.yaml`
- `k8s/base/mongodb/service.yaml`
- `k8s/base/redis/service.yaml`
- `k8s/base/kafka/kafka.yaml`
- `k8s/base/kafka/zookeeper.yaml`

#### 2단계: ConfigMap 업데이트

**`k8s/base/configmap.yaml` 수정:**
```yaml
# Database Configuration
MYSQL_HOST: "service-mysql"
MONGODB_HOST: "service-mongodb"
REDIS_HOST: "service-redis"
KAFKA_BOOTSTRAP_SERVERS: "service-kafka:9092"
```

**`k8s/overlays/dev/configmap.yaml` 수정:**
```yaml
# 환경 변수 수정
ENVIRONMENT: "dev"  # "development" → "dev"로 변경

# 데이터베이스 호스트 업데이트
MYSQL_HOST: "service-mysql"
MONGODB_HOST: "service-mongodb"
REDIS_HOST: "service-redis"
KAFKA_BOOTSTRAP_SERVERS: "service-kafka:9092"
```

#### 3단계: Nginx 프록시 설정 수정

**문제:** nginx에서 짧은 서비스명 해결 실패
```nginx
# Before (실패)
set $upstream http://ranking-service:8000;
```

**해결:** 완전한 FQDN 사용
```nginx
# After (성공)
set $upstream http://ranking-service.trip-service-dev.svc.cluster.local:8000;
set $upstream http://currency-service.trip-service-dev.svc.cluster.local:8000;
set $upstream http://history-service.trip-service-dev.svc.cluster.local:8000;
```

**수정된 파일:** `frontend/nginx.conf`

#### 4단계: 배포 및 재시작

```bash
# 1. 모든 구성 적용
kubectl apply -k k8s/overlays/dev --server-side --force-conflicts

# 2. 백엔드 서비스 재시작 (새로운 DNS 이름 적용)
kubectl rollout restart deployment/currency-service deployment/ranking-service deployment/history-service deployment/dataingestor-service -n trip-service-dev

# 3. Frontend 이미지 재빌드 및 배포
docker build -f frontend/Dockerfile -t trip-service/frontend:dev-latest .
kubectl rollout restart deployment/frontend -n trip-service-dev
```

### 검증 과정

#### 1. 직접 서비스 연결 테스트
```bash
# Frontend 파드에서 백엔드 API 호출 성공
kubectl exec -n trip-service-dev deployment/frontend -- curl -s "http://ranking-service:8000/api/v1/rankings?limit=10&offset=0"

# 응답 성공 ✅
{"data":{"rankings":[],"total_count":0,"limit":10,"date":"2025-09-23","updated_at":"2025-09-23T12:03:09.750906Z"},"success":true,"timestamp":"2025-09-23T12:03:09.751082"}
```

#### 2. DNS 해결 확인
```bash
# DNS 해결 성공 ✅
kubectl exec -n trip-service-dev deployment/frontend -- nslookup ranking-service
# Name: ranking-service.trip-service-dev.svc.cluster.local
# Address: 10.100.96.23
```

#### 3. 웹 접속 확인
```bash
# 포트포워딩으로 웹 접속 ✅
kubectl port-forward service/frontend-service 8081:80 -n trip-service-dev
# 브라우저에서 http://localhost:8081 접속 성공
```

### 문제 해결 핵심 포인트

#### 1. 서비스 디스커버리 표준화
- **문제**: 일관되지 않은 서비스 명명 규칙
- **해결**: `service-*` 패턴으로 통일
- **효과**: DNS 해결 안정성 향상

#### 2. Nginx DNS 해결 개선
- **문제**: 짧은 서비스명 해결 실패
- **해결**: 완전한 FQDN 사용
- **효과**: 프록시 연결 안정성 확보

#### 3. 환경 변수 정규화
- **문제**: 애플리케이션과 설정 간 불일치
- **해결**: 표준 환경값 사용 (`dev`)
- **효과**: 서비스 시작 안정성 보장

### 최종 결과 ✅

#### Before (문제 상황)
```
❌ 502 Bad Gateway 오류
❌ ranking-service DNS 해결 실패
❌ 백엔드 API 호출 불가
❌ 프론트엔드 데이터 로딩 실패
```

#### After (해결 완료)
```
✅ HTTP 200 응답 성공
✅ 모든 서비스 DNS 해결 성공
✅ 백엔드 API 정상 호출
✅ 프론트엔드 정상 작동
✅ 웹 애플리케이션 완전 가동
```

### 교훈 및 Best Practices

#### 1. 서비스 명명 규칙
- 일관된 명명 패턴 사용 (`service-*`)
- 전체 시스템에서 표준화된 명명 규칙 적용
- DNS 해결 안정성을 위한 표준 도메인 사용

#### 2. Nginx 프록시 설정
- Kubernetes 환경에서는 완전한 FQDN 사용 권장
- DNS resolver 설정과 함께 안정적인 서비스 디스커버리 구성
- 짧은 서비스명보다는 명시적인 도메인명 사용

#### 3. 환경 설정 관리
- 애플리케이션 코드와 ConfigMap 간 일치성 확보
- 환경별 설정값 표준화 (dev, staging, prod)
- Validation 오류 방지를 위한 설정값 검증

### 예방 방법

#### 1. 개발 단계
- 서비스명 표준화 가이드라인 수립
- DNS 해결 테스트 자동화
- 환경 변수 검증 로직 추가

#### 2. 배포 단계
- DNS 연결 헬스체크 추가
- 프록시 설정 검증 스크립트
- 단계별 배포 및 검증 프로세스

#### 3. 모니터링
- nginx 에러 로그 모니터링
- 502 에러 알림 설정
- 서비스 디스커버리 상태 대시보드

---

## 12. Ingress 설정 및 포트포워딩 대안

### 문제 배경
개발 과정에서 포트포워딩(`kubectl port-forward`)을 사용했지만, Pod 재시작 시마다 연결이 끊어지는 문제가 반복적으로 발생했습니다.

### 포트포워딩의 한계점

#### 1. **Pod 재시작 시 연결 끊김**
```bash
# Frontend 재빌드 및 재시작 시
kubectl rollout restart deployment/frontend

# 포트포워딩 오류 발생
error: lost connection to pod
container not running (c9c191c8d021f686a093b9d52056d0280821aa177cdf3275a5433c03fed4445a)
```

#### 2. **수동 관리 필요**
- Pod 재시작할 때마다 포트포워딩 재시작 필요
- 개발 워크플로우 중단
- 포트 충돌 문제 (8080, 8081, 8082...)

#### 3. **운영 환경과의 차이**
- 로컬 개발환경과 실제 배포환경 간 접속 방식 차이
- 실제 도메인 기반 라우팅 테스트 불가

### 해결방안: Kubernetes Ingress 활용

#### 1. **Ingress 아키텍처 검토**

**기존 Ingress 설정 확인:**
```bash
kubectl get ingress -n trip-service-dev
```

**결과:**
```
NAME                        CLASS    HOSTS                                               ADDRESS         PORTS   AGE
frontend-ingress            nginx    trip-service.local                                  192.168.0.101   80      72m
trip-service-main-ingress   <none>   dev.trip-service.local,api-dev.trip-service.local   192.168.0.101   80      48m
```

#### 2. **Ingress 구성 분석**

**메인 Ingress 파일**: `k8s/base/ingress/trip-service-ingress.yaml`
- ✅ 이중 Ingress 구조 (메인 + 관리자)
- ✅ 완전한 서비스 라우팅 설정
- ✅ CORS 및 프록시 설정 완료
- ✅ 개발환경 최적화 (SSL 비활성화)

**개발환경 패치**: `k8s/overlays/dev/ingress-patch.yaml`
- ✅ 개발 전용 도메인 (`dev.trip-service.local`)
- ✅ API 도메인 분리 (`api-dev.trip-service.local`)
- ✅ HTTP 허용 설정

#### 3. **서비스 라우팅 매핑**

**Frontend 접속:**
```yaml
- host: dev.trip-service.local
  http:
    paths:
    - path: /
      pathType: Prefix
      backend:
        service:
          name: frontend-service
          port:
            number: 80
```

**API 서비스 라우팅:**
```yaml
- host: api-dev.trip-service.local
  http:
    paths:
    - path: /currency      # → currency-service:8000
    - path: /history       # → history-service:8000
    - path: /ranking       # → ranking-service:8000
    - path: /dataingestor  # → dataingestor-service:8000
```

### 설정 및 접속 방법

#### 1. **Ingress 상태 확인**
```bash
# Ingress 리소스 확인
kubectl get ingress -n trip-service-dev

# 상세 정보 확인
kubectl describe ingress trip-service-main-ingress -n trip-service-dev

# Nginx Ingress Controller 상태 확인
kubectl get pods -n ingress-nginx
```

#### 2. **Windows hosts 파일 설정**

**파일 위치**: `C:\Windows\System32\drivers\etc\hosts`

**추가할 내용:**
```
# Trip Service Development Environment
192.168.0.101 dev.trip-service.local
192.168.0.101 api-dev.trip-service.local
192.168.0.101 trip-service.local
192.168.0.101 kafka-ui.trip-service.local
```

**설정 방법:**
1. **관리자 권한으로 메모장 실행**
2. **파일 → 열기** → `C:\Windows\System32\drivers\etc\hosts`
3. **파일 형식을 "모든 파일"로 변경**
4. **위 내용을 파일 끝에 추가**
5. **저장**

#### 3. **접속 테스트**

**Frontend 접속:**
- Primary: `http://dev.trip-service.local`
- Alternative: `http://trip-service.local`

**API 테스트:**
```bash
# Ranking API 테스트
curl http://api-dev.trip-service.local/ranking

# Currency API 테스트
curl http://api-dev.trip-service.local/currency

# Health Check
curl http://api-dev.trip-service.local/health
```

**관리 도구 접속:**
- Kafka UI: `http://kafka-ui.trip-service.local`
- (기본 인증: admin/admin123)

### Ingress vs 포트포워딩 비교

| 구분 | 포트포워딩 | Ingress |
|------|------------|---------|
| **안정성** | ❌ Pod 재시작 시 끊김 | ✅ 지속적 연결 |
| **설정 복잡도** | ✅ 간단 | ⚠️ 초기 설정 필요 |
| **운영 환경 일치** | ❌ 차이 있음 | ✅ 동일한 방식 |
| **도메인 기반 라우팅** | ❌ 불가능 | ✅ 완전 지원 |
| **SSL/TLS** | ❌ 지원 안함 | ✅ 지원 |
| **로드밸런싱** | ❌ 단일 Pod | ✅ 자동 분산 |
| **API 경로 관리** | ❌ 복잡 | ✅ 체계적 |

### 주요 장점 및 효과

#### 1. **개발 효율성 향상**
- **Before**: Pod 재시작할 때마다 포트포워딩 재시작
- **After**: 도메인 접속으로 중단 없는 개발

#### 2. **운영 환경 일치성**
- **실제 도메인 기반 라우팅 테스트**
- **API 경로 구조 검증**
- **CORS 설정 검증**

#### 3. **확장성 및 관리성**
- **여러 서비스 통합 관리**
- **환경별 도메인 분리** (dev, staging, prod)
- **중앙화된 라우팅 설정**

### 트러블슈팅 가이드

#### 1. **접속이 안되는 경우**

**DNS 확인:**
```bash
# hosts 파일 적용 확인
nslookup dev.trip-service.local

# ping 테스트
ping dev.trip-service.local
```

**Ingress Controller 상태 확인:**
```bash
kubectl get pods -n ingress-nginx
kubectl logs -n ingress-nginx deployment/ingress-nginx-controller
```

#### 2. **502 Bad Gateway 오류**

**백엔드 서비스 상태 확인:**
```bash
kubectl get pods -n trip-service-dev
kubectl get services -n trip-service-dev
```

**Ingress 로그 확인:**
```bash
kubectl logs -n ingress-nginx deployment/ingress-nginx-controller | grep "trip-service"
```

#### 3. **SSL/인증서 문제 (운영환경)**

**인증서 확인:**
```bash
kubectl get secrets -n trip-service-dev | grep tls
kubectl describe ingress trip-service-main-ingress -n trip-service-dev
```

### 운영 환경 고려사항

#### 1. **SSL/TLS 설정**
```yaml
# 운영환경용 SSL 설정
spec:
  tls:
  - hosts:
    - trip-service.com
    - api.trip-service.com
    secretName: trip-service-tls
```

#### 2. **도메인 및 인증서 관리**
- **Let's Encrypt 자동 인증서**
- **cert-manager 설치 권장**
- **와일드카드 인증서 고려**

#### 3. **보안 강화**
```yaml
# 운영환경 보안 설정
annotations:
  nginx.ingress.kubernetes.io/ssl-redirect: "true"
  nginx.ingress.kubernetes.io/force-ssl-redirect: "true"
  nginx.ingress.kubernetes.io/proxy-body-size: "1m"
  nginx.ingress.kubernetes.io/rate-limit: "100"
```

### 결과 및 효과 ✅

#### Before (포트포워딩)
```
❌ kubectl port-forward service/frontend-service 8082:80
❌ Pod 재시작할 때마다 재연결 필요
❌ 포트 충돌 및 관리 복잡성
❌ 운영환경과 다른 접속 방식
```

#### After (Ingress)
```
✅ http://dev.trip-service.local
✅ 안정적이고 지속적인 연결
✅ 도메인 기반 전문적인 개발환경
✅ 운영환경과 동일한 라우팅 방식
✅ 포트포워딩 의존성 제거
```

### Best Practices

#### 1. **개발 단계**
- **로컬 개발**: 포트포워딩으로 빠른 테스트
- **통합 테스트**: Ingress로 실제 환경 시뮬레이션
- **배포 검증**: 동일한 도메인 구조로 검증

#### 2. **팀 협업**
- **표준 도메인 구조 문서화**
- **hosts 파일 설정 가이드 공유**
- **API 엔드포인트 문서 업데이트**

#### 3. **모니터링**
- **Ingress 로그 모니터링**
- **도메인별 접속 통계**
- **SSL 인증서 만료 알림**

---