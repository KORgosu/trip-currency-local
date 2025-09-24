# Trip Service Kubernetes 마이그레이션 v1.0

## 📋 프로젝트 개요

### 원래 요구사항
사용자가 요청한 조건에 따라 Trip Service를 Kubernetes 환경으로 재구성하는 작업을 수행했습니다.

**주요 요구사항:**
- 4개 마이크로서비스 (currency-service, ranking-service, data-ingestor, history-service)
- 3개 데이터베이스 (Redis, MongoDB, MariaDB)
- Kafka 클러스터 구성
- Shared 패키지 GitHub 분리
- Jenkins + ArgoCD CI/CD 파이프라인
- 한국시간 0시 기준 데이터 초기화
- 정기 작업 스케줄링 (1분, 2분, 1시간)

## 🎯 작업 수행 이유 및 배경

### 1. 마이크로서비스 아키텍처의 필요성

**왜 마이크로서비스를 선택했는가?**
- **확장성**: 각 서비스별 독립적 스케일링 가능
- **장애 격리**: 하나의 서비스 장애가 전체 시스템에 영향 주지 않음
- **기술 스택 다양성**: 각 서비스마다 최적의 기술 선택 가능
- **팀 독립성**: 서로 다른 팀이 독립적으로 개발/배포 가능

**구현한 4개 서비스:**
```
currency-service    → 환율 데이터 제공 (Redis 캐시 우선)
ranking-service     → 사용자 클릭수 기반 랭킹 (MongoDB)
data-ingestor       → 외부 API 데이터 수집 (MySQL 저장)
history-service     → 환율 변동 분석 (MySQL 기반)
```

### 2. Kubernetes 선택 이유

**왜 Docker Compose 대신 Kubernetes를 선택했는가?**
- **프로덕션 준비**: 실제 운영 환경에서 사용 가능한 오케스트레이션
- **자동 스케일링**: HPA를 통한 부하에 따른 자동 확장/축소
- **서비스 디스커버리**: 내장된 DNS 기반 서비스 발견
- **롤링 업데이트**: 무중단 배포 지원
- **리소스 관리**: CPU/메모리 제한 및 관리
- **모니터링**: 내장된 헬스체크 및 로그 수집

### 3. 데이터베이스 선택 및 역할 분담

**왜 3개의 다른 데이터베이스를 사용했는가?**

#### MariaDB (MySQL)
- **역할**: 환율 이력 데이터 저장
- **선택 이유**: 
  - ACID 트랜잭션 보장
  - 복잡한 쿼리 지원 (일별 집계, 통계 분석)
  - 한국시간 0시 초기화를 위한 이벤트 스케줄러 지원
- **사용 테이블**: `exchange_rates`, `user_selections`, `daily_stats`

#### Redis
- **역할**: 최신 환율 데이터 캐싱
- **선택 이유**:
  - 초고속 읽기/쓰기 성능
  - TTL 지원으로 자동 만료 관리
  - 실시간 데이터 접근에 최적화
- **사용 패턴**: `rate:{currency_code}` 형태로 캐싱

#### MongoDB
- **역할**: 랭킹 데이터 저장
- **선택 이유**:
  - 유연한 스키마 (랭킹 데이터 구조 변경 용이)
  - 수평 확장 가능
  - JSON 형태의 복잡한 데이터 구조 저장에 적합
- **사용 컬렉션**: `rankings`, `country_stats`, `daily_selections`

### 4. Kafka 메시징 시스템 도입

**왜 Kafka를 선택했는가?**
- **실시간 스트리밍**: 환율 데이터 변경 시 실시간 알림
- **장애 복구**: 메시지 손실 방지 및 재처리 가능
- **확장성**: 높은 처리량 지원
- **서비스 간 느슨한 결합**: 이벤트 기반 아키텍처

**구현된 메시징 플로우:**
```
data-ingestor → Kafka → [currency-service, ranking-service, history-service]
```

### 5. Shared 패키지 분리

**왜 Shared 모듈을 별도 패키지로 분리했는가?**
- **코드 재사용성**: 여러 서비스에서 공통 모듈 사용
- **버전 관리**: 독립적인 버전 관리 및 업데이트
- **의존성 관리**: pip를 통한 명확한 의존성 관리
- **CI/CD 최적화**: 공통 모듈 변경 시 관련 서비스만 재빌드

## 🏗️ 구현된 아키텍처

### 전체 시스템 구조
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Ingress       │    │   Load Balancer │
│   (React)       │◄───┤   (NGINX)       │◄───┤   (External)    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                    ┌───────────┼───────────┐
                    │           │           │
            ┌───────▼───┐ ┌─────▼───┐ ┌─────▼───┐
            │Currency   │ │Ranking  │ │History  │
            │Service    │ │Service  │ │Service  │
            └───────┬───┘ └─────┬───┘ └─────┬───┘
                    │           │           │
            ┌───────▼───┐ ┌─────▼───┐ ┌─────▼───┐
            │   Redis   │ │ MongoDB │ │ MariaDB │
            │  (Cache)  │ │(Ranking)│ │(History)│
            └───────────┘ └─────────┘ └─────────┘
                    │           │           │
                    └───────────┼───────────┘
                                │
                        ┌───────▼───┐
                        │   Kafka   │
                        │(Messaging)│
                        └───────────┘
```

### 서비스별 상세 기능

#### 1. Currency Service
- **기능**: 실시간 환율 정보 제공
- **데이터 소스**: Redis 캐시 (1차) → MariaDB (2차)
- **API 엔드포인트**: `/api/v1/currencies/*`
- **스케일링**: HPA로 CPU/메모리 기반 자동 확장

#### 2. Ranking Service
- **기능**: 사용자 클릭수 기반 나라 랭킹
- **데이터 소스**: MongoDB
- **스케줄링**: 1분마다 랭킹 계산 (CronJob)
- **초기화**: 한국시간 0시 클릭수 리셋

#### 3. Data Ingestor
- **기능**: 외부 API에서 환율 데이터 수집
- **스케줄링**: 2분마다 데이터 수집 (CronJob)
- **처리 과정**: 수집 → 정제 → MySQL 저장 → Redis 캐싱 → Kafka 이벤트 전송

#### 4. History Service
- **기능**: 환율 변동 분석 및 그래프 데이터 제공
- **스케줄링**: 1시간마다 분석 (CronJob)
- **데이터 소스**: MariaDB 이력 데이터

## 📁 생성된 파일 구조

### Kubernetes 매니페스트
```
k8s/
├── namespace.yaml              # 네임스페이스 정의
├── configmap.yaml             # 환경 설정
├── secrets.yaml               # 민감한 정보
├── ingress.yaml               # 외부 접근 설정
├── databases/
│   ├── mariadb.yaml           # MariaDB 배포
│   ├── redis.yaml             # Redis 배포
│   └── mongodb.yaml           # MongoDB 배포
├── kafka/
│   ├── zookeeper.yaml         # Zookeeper 클러스터
│   └── kafka.yaml             # Kafka 클러스터
├── services/
│   ├── currency-service.yaml  # 환율 서비스
│   ├── ranking-service.yaml   # 랭킹 서비스
│   ├── data-ingestor.yaml     # 데이터 수집기
│   └── history-service.yaml   # 히스토리 서비스
└── frontend/
    └── frontend.yaml          # 프론트엔드
```

### Helm 차트
```
helm/trip-service/
├── Chart.yaml                 # 차트 메타데이터
├── values.yaml                # 기본 설정값
└── templates/
    ├── _helpers.tpl           # 템플릿 헬퍼
    ├── namespace.yaml         # 네임스페이스 템플릿
    ├── configmap.yaml         # ConfigMap 템플릿
    └── secrets.yaml           # Secret 템플릿
```

### CI/CD 파이프라인
```
ci-cd/
├── jenkins/
│   └── Jenkinsfile            # Jenkins 파이프라인
└── argocd/
    ├── application.yaml       # 프로덕션 앱
    ├── application-staging.yaml # 스테이징 앱
    └── application-production.yaml # 프로덕션 앱
```

### Shared 패키지
```
shared-package/
├── setup.py                   # 패키지 설정
├── requirements.txt           # 의존성
├── README.md                  # 사용법
└── trip_service_shared/
    ├── __init__.py            # 패키지 초기화
    ├── config.py              # 설정 관리
    ├── database.py            # DB 연결
    ├── models.py              # 데이터 모델
    ├── exceptions.py          # 예외 처리
    ├── logging.py             # 로깅 설정
    ├── messaging.py           # Kafka 메시징
    └── utils.py               # 유틸리티
```

## 🔧 주요 기술적 결정사항

### 1. 환경 변수 관리
**왜 ConfigMap과 Secret을 분리했는가?**
- **ConfigMap**: 일반적인 설정값 (포트, 호스트명 등)
- **Secret**: 민감한 정보 (비밀번호, API 키 등)
- **보안**: Secret은 암호화되어 저장되고 전송

### 2. 리소스 관리
**왜 리소스 제한을 설정했는가?**
```yaml
resources:
  requests:
    memory: "256Mi"
    cpu: "250m"
  limits:
    memory: "512Mi"
    cpu: "500m"
```
- **안정성**: 메모리 누수나 CPU 과사용 방지
- **예측 가능성**: 리소스 사용량 예측 및 계획
- **공정성**: 다른 서비스에 영향 주지 않음

### 3. 헬스체크 구현
**왜 헬스체크를 구현했는가?**
```yaml
livenessProbe:
  httpGet:
    path: /health
    port: 8000
  initialDelaySeconds: 60
  periodSeconds: 30
```
- **자동 복구**: 장애 시 자동으로 Pod 재시작
- **로드밸런싱**: 정상적인 Pod만 트래픽 수신
- **모니터링**: 서비스 상태 실시간 확인

### 4. HPA (Horizontal Pod Autoscaler)
**왜 자동 스케일링을 구현했는가?**
```yaml
autoscaling:
  enabled: true
  minReplicas: 2
  maxReplicas: 10
  targetCPUUtilizationPercentage: 70
```
- **비용 최적화**: 필요에 따라 자동 확장/축소
- **성능 보장**: 부하 증가 시 자동으로 인스턴스 추가
- **운영 효율성**: 수동 개입 없이 자동 관리

## 🚀 배포 전략

### 1. 단계별 배포
1. **데이터베이스 배포**: MariaDB, Redis, MongoDB
2. **메시징 시스템**: Zookeeper, Kafka
3. **마이크로서비스**: 각 서비스 순차 배포
4. **프론트엔드**: 웹 애플리케이션 배포
5. **Ingress**: 외부 접근 설정

### 2. 환경별 분리
- **Staging**: 개발/테스트 환경
- **Production**: 실제 운영 환경
- **Values 파일**: 환경별 설정 분리

### 3. 롤백 전략
- **Helm History**: 이전 버전으로 롤백 가능
- **Blue-Green**: 무중단 배포 지원
- **Canary**: 점진적 배포 가능

## 📊 모니터링 및 로깅

### 1. 로그 수집
- **구조화된 로깅**: JSON 형태로 로그 출력
- **상관관계 ID**: 요청 추적을 위한 고유 ID
- **서비스별 로그**: 각 서비스의 독립적인 로그

### 2. 메트릭 수집
- **리소스 사용량**: CPU, 메모리, 네트워크
- **애플리케이션 메트릭**: 요청 수, 응답 시간, 에러율
- **비즈니스 메트릭**: 환율 조회 수, 랭킹 계산 횟수

### 3. 알림 시스템
- **장애 알림**: 서비스 다운 시 즉시 알림
- **성능 알림**: 응답 시간 임계값 초과 시 알림
- **비즈니스 알림**: 데이터 수집 실패 시 알림

## 🔒 보안 고려사항

### 1. 네트워크 보안
- **네임스페이스 격리**: 서비스별 네트워크 분리
- **Ingress 보안**: HTTPS 강제, CORS 설정
- **내부 통신**: 서비스 간 TLS 암호화

### 2. 데이터 보안
- **Secret 관리**: 민감한 정보 암호화 저장
- **접근 제어**: RBAC 기반 권한 관리
- **데이터 암호화**: 저장 시 및 전송 시 암호화

### 3. 컨테이너 보안
- **이미지 스캔**: 보안 취약점 검사
- **최소 권한**: 필요한 최소 권한만 부여
- **정기 업데이트**: 보안 패치 자동 적용

## 🎯 성과 및 효과

### 1. 확장성 개선
- **수평 확장**: HPA를 통한 자동 스케일링
- **데이터베이스 분리**: 각 용도에 최적화된 DB 사용
- **캐싱 전략**: Redis를 통한 성능 향상

### 2. 운영 효율성
- **자동화**: CI/CD 파이프라인으로 자동 배포
- **모니터링**: 실시간 상태 확인 및 알림
- **장애 복구**: 자동 재시작 및 롤백

### 3. 개발 생산성
- **서비스 분리**: 독립적인 개발 및 배포
- **공통 모듈**: Shared 패키지로 코드 재사용
- **환경 일관성**: 개발/스테이징/프로덕션 환경 통일

## 🔮 향후 개선 계획

### 1. 모니터링 강화
- **Prometheus + Grafana**: 메트릭 수집 및 시각화
- **ELK Stack**: 로그 집계 및 분석
- **Jaeger**: 분산 추적 시스템

### 2. 보안 강화
- **Istio**: 서비스 메시 도입
- **Vault**: Secret 관리 시스템
- **Network Policy**: 세밀한 네트워크 제어

### 3. 성능 최적화
- **CDN**: 정적 자원 캐싱
- **Connection Pooling**: DB 연결 최적화
- **Caching Strategy**: 다층 캐싱 전략

## 📝 결론

이번 Kubernetes 마이그레이션을 통해 다음과 같은 목표를 달성했습니다:

1. **확장 가능한 아키텍처**: 마이크로서비스 기반의 유연한 시스템
2. **운영 자동화**: CI/CD 파이프라인과 자동 스케일링
3. **안정성 향상**: 장애 격리 및 자동 복구
4. **개발 효율성**: 서비스별 독립 개발 및 배포
5. **비용 최적화**: 리소스 사용량 기반 자동 스케일링

이러한 구조를 통해 Trip Service는 프로덕션 환경에서 안정적으로 운영될 수 있으며, 향후 기능 확장이나 트래픽 증가에 대응할 수 있는 견고한 기반을 마련했습니다.

---

**작업 완료일**: 2024년 9월 17일  
**버전**: v1.0  
**작업자**: AI Assistant  
**문서 상태**: 초기 버전
