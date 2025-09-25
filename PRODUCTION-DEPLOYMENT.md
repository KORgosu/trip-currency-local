# Production Deployment Guide

## 📋 개요
이 가이드는 Trip Service를 운영환경에 배포하는 방법을 설명합니다.

## 🚀 배포 프로세스

### 1단계: 이미지 빌드 및 레지스트리 푸시 (CI/CD 환경에서)

```bash
# 이미지 빌드
docker build -f frontend/Dockerfile -t your-registry.com/trip-service/service-frontend:prod-latest .
docker build -f service-currency/Dockerfile -t your-registry.com/trip-service/service-currency:prod-latest .
docker build -f service-history/Dockerfile -t your-registry.com/trip-service/service-history:prod-latest .
docker build -f service-ranking/Dockerfile -t your-registry.com/trip-service/service-ranking:prod-latest .
docker build -f service-dataingestor/Dockerfile -t your-registry.com/trip-service/service-dataingestor:prod-latest .

# 레지스트리에 푸시
docker push your-registry.com/trip-service/service-frontend:prod-latest
docker push your-registry.com/trip-service/service-currency:prod-latest
docker push your-registry.com/trip-service/service-history:prod-latest
docker push your-registry.com/trip-service/service-ranking:prod-latest
docker push your-registry.com/trip-service/service-dataingestor:prod-latest
```

### 2단계: 운영 서버 설정

운영 서버에서 다음 사전 요구사항을 확인하세요:

```bash
# Kubernetes 클러스터 상태 확인
kubectl get nodes

# kubectl 버전 확인
kubectl version --client
```

### 3단계: 레지스트리 설정 수정

`k8s/overlays/prod/kustomization.yaml` 파일에서 `your-registry.com`을 실제 레지스트리 주소로 변경하세요:

```yaml
# 예시: Docker Hub 사용시
value: username/trip-service-frontend:prod-latest

# 예시: AWS ECR 사용시
value: 123456789012.dkr.ecr.us-west-2.amazonaws.com/trip-service/service-frontend:prod-latest

# 예시: GCR 사용시
value: gcr.io/project-id/trip-service/service-frontend:prod-latest
```

### 4단계: 운영환경 배포

```bash
# 프로젝트 클론 (매니페스트만 필요)
git clone <repository-url>
cd trip-service-local

# 프로덕션 네임스페이스 생성
kubectl create namespace trip-service-prod

# 프로덕션 환경 배포
kubectl apply -k k8s/overlays/prod/

# 배포 상태 확인
kubectl get pods -n trip-service-prod
kubectl get services -n trip-service-prod
```

### 5단계: 배포 검증

```bash
# 모든 파드가 Running 상태인지 확인
kubectl get pods -n trip-service-prod

# 서비스 상태 확인
kubectl get services -n trip-service-prod

# 헬스체크
kubectl run test-pod --image=curlimages/curl -i --tty --rm -n trip-service-prod -- sh
# 테스트 팟에서:
# curl http://service-currency:8000/health
# curl http://service-history:8000/health
# curl http://service-ranking:8000/health
```

## 🔧 운영 관리

### 서비스 업데이트

```bash
# 새 이미지 태그로 업데이트
kubectl set image deployment/service-currency service-currency=your-registry.com/trip-service/service-currency:v1.1.0 -n trip-service-prod

# 롤아웃 상태 확인
kubectl rollout status deployment/service-currency -n trip-service-prod
```

### 스케일링

```bash
# 수평 스케일링
kubectl scale deployment service-currency --replicas=5 -n trip-service-prod

# 오토스케일링 확인 (HPA 설정된 경우)
kubectl get hpa -n trip-service-prod
```

### 로그 확인

```bash
# 특정 서비스 로그
kubectl logs -l app=service-currency -n trip-service-prod

# 실시간 로그
kubectl logs -f deployment/service-currency -n trip-service-prod
```

## 🔐 보안 고려사항

1. **Secrets 관리**: Kubernetes Secrets 또는 외부 Secret Manager 사용
2. **네트워크 정책**: Pod 간 통신 제한
3. **RBAC**: 적절한 권한 설정
4. **이미지 보안**: 정기적인 취약점 스캔

## 📊 모니터링

### 기본 모니터링
```bash
# 리소스 사용량 (metrics-server 필요)
kubectl top pods -n trip-service-prod
kubectl top nodes
```

### 권장 모니터링 스택
- **Prometheus + Grafana**: 메트릭 수집 및 시각화
- **ELK/EFK Stack**: 로그 수집 및 분석
- **Jaeger**: 분산 트레이싱

## 🚨 트러블슈팅

### 일반적인 문제들

1. **이미지 Pull 실패**
   ```bash
   # 이미지 레지스트리 인증 확인
   kubectl describe pod <pod-name> -n trip-service-prod
   ```

2. **서비스 연결 실패**
   ```bash
   # 서비스 엔드포인트 확인
   kubectl get endpoints -n trip-service-prod
   ```

3. **데이터베이스 연결 실패**
   ```bash
   # ConfigMap과 Secret 확인
   kubectl get configmap -n trip-service-prod
   kubectl get secrets -n trip-service-prod
   ```

## 💾 백업 전략

### 데이터베이스 백업
```bash
# MySQL 백업 (예시)
kubectl exec -n trip-service-prod deployment/mysql -- mysqldump -u root -p<password> currency_db > backup.sql

# MongoDB 백업 (예시)
kubectl exec -n trip-service-prod deployment/mongodb -- mongodump --db trip_db --out /backup
```

### 설정 백업
```bash
# Kubernetes 매니페스트 백업
kubectl get all -n trip-service-prod -o yaml > trip-service-backup.yaml
```

## 📞 지원

운영 중 문제 발생시:
1. `kubectl get events -n trip-service-prod --sort-by='.lastTimestamp'`로 이벤트 확인
2. 해당 서비스 로그 확인
3. 서비스 상태 및 엔드포인트 확인