# 쿠버네티스 클러스터 완전 리셋 가이드

이 문서는 현재 구동 중인 쿠버네티스 클러스터를 완전히 리셋하고 모든 리소스를 정리하는 방법을 설명합니다.

## ⚠️ 주의사항

- 이 작업은 **모든 데이터를 삭제**합니다
- 실행 중인 모든 애플리케이션이 중단됩니다
- 되돌릴 수 없는 작업이므로 신중하게 진행하세요

## 📋 리셋 단계별 명령어

### 1단계: 쿠버네티스 리소스 정리

#### 1.1 네임스페이스 정리
```bash
# 모든 네임스페이스 삭제 (시스템 네임스페이스 제외)
kubectl delete --all namespaces --grace-period=0 --force
```

#### 1.2 파드 정리
```bash
# 모든 파드 삭제
kubectl delete --all pods --all-namespaces --grace-period=0 --force
```

#### 1.3 서비스 정리
```bash
# 모든 서비스 삭제
kubectl delete --all services --all-namespaces
```

#### 1.4 배포 정리
```bash
# 모든 배포 삭제
kubectl delete --all deployments --all-namespaces
```

#### 1.5 ConfigMap 정리
```bash
# 모든 ConfigMap 삭제
kubectl delete --all configmaps --all-namespaces
```

#### 1.6 Secret 정리
```bash
# 모든 Secret 삭제
kubectl delete --all secrets --all-namespaces
```

#### 1.7 CronJob 정리
```bash
# 모든 CronJob 삭제
kubectl delete --all cronjobs --all-namespaces
```

#### 1.8 Job 정리
```bash
# 모든 Job 삭제
kubectl delete --all jobs --all-namespaces
```

#### 1.9 HPA 정리
```bash
# 모든 HorizontalPodAutoscaler 삭제
kubectl delete --all hpa --all-namespaces
```

### 2단계: Docker 컨테이너 정리

#### 2.1 실행 중인 컨테이너 중지
```bash
# 모든 실행 중인 컨테이너 중지
docker stop $(docker ps -aq)
```

#### 2.2 컨테이너 정리
```bash
# 모든 컨테이너 삭제
docker container prune -f
```

### 3단계: Docker 이미지 정리

#### 3.1 모든 이미지 삭제
```bash
# 사용하지 않는 모든 이미지 삭제
docker image prune -a -f
```

### 4단계: Docker 볼륨 정리

#### 4.1 볼륨 정리
```bash
# 사용하지 않는 볼륨 삭제
docker volume prune -f
```

### 5단계: Docker 네트워크 정리

#### 5.1 네트워크 정리
```bash
# 사용하지 않는 네트워크 삭제
docker network prune -f
```

### 6단계: Docker 시스템 전체 정리

#### 6.1 시스템 전체 정리
```bash
# 모든 리소스 정리 (이미지, 컨테이너, 볼륨, 네트워크, 빌드 캐시)
docker system prune -a -f --volumes
```

### 7단계: 쿠버네티스 컨텍스트 확인

#### 7.1 현재 컨텍스트 확인
```bash
# 사용 가능한 컨텍스트 목록 확인
kubectl config get-contexts
```

#### 7.2 컨텍스트 전환 (필요시)
```bash
# docker-desktop 컨텍스트로 전환
kubectl config use-context docker-desktop
```

### 8단계: 최종 확인

#### 8.1 쿠버네티스 리소스 확인
```bash
# 모든 리소스 상태 확인
kubectl get all --all-namespaces
```

#### 8.2 Docker 이미지 확인
```bash
# 남은 이미지 확인
docker images
```

## 🚀 원라이너 스크립트

### PowerShell 원라이너 (Windows)
```powershell
# 쿠버네티스 리소스 정리
kubectl delete --all namespaces --grace-period=0 --force; kubectl delete --all pods --all-namespaces --grace-period=0 --force; kubectl delete --all services --all-namespaces; kubectl delete --all deployments --all-namespaces; kubectl delete --all configmaps --all-namespaces; kubectl delete --all secrets --all-namespaces; kubectl delete --all cronjobs --all-namespaces; kubectl delete --all jobs --all-namespaces; kubectl delete --all hpa --all-namespaces

# Docker 리소스 정리
docker stop $(docker ps -aq); docker container prune -f; docker image prune -a -f; docker volume prune -f; docker network prune -f; docker system prune -a -f --volumes
```

### Bash 원라이너 (Linux/macOS)
```bash
# 쿠버네티스 리소스 정리
kubectl delete --all namespaces --grace-period=0 --force && \
kubectl delete --all pods --all-namespaces --grace-period=0 --force && \
kubectl delete --all services --all-namespaces && \
kubectl delete --all deployments --all-namespaces && \
kubectl delete --all configmaps --all-namespaces && \
kubectl delete --all secrets --all-namespaces && \
kubectl delete --all cronjobs --all-namespaces && \
kubectl delete --all jobs --all-namespaces && \
kubectl delete --all hpa --all-namespaces

# Docker 리소스 정리
docker stop $(docker ps -aq) && \
docker container prune -f && \
docker image prune -a -f && \
docker volume prune -f && \
docker network prune -f && \
docker system prune -a -f --volumes
```

## 📊 정리 결과

### 예상 절약 공간
- **Docker 이미지**: ~2.81GB
- **Docker 볼륨**: ~67.34MB  
- **Docker 빌드 캐시**: ~6.567GB
- **총 절약 공간**: **약 9.4GB**

### 정리 후 상태
- ✅ 쿠버네티스 클러스터: 깨끗한 상태 (시스템 파드만 남음)
- ✅ Docker: 기본 쿠버네티스 이미지만 남음
- ✅ 모든 애플리케이션 리소스 삭제됨

## 🔄 리셋 후 다음 단계

### 1. Docker Desktop 재시작 (권장)
Docker Desktop을 완전히 재시작하여 쿠버네티스 클러스터를 새로 초기화합니다.

### 2. 새로운 배포 시작
```bash
# 개별 이미지 빌드
docker build -f frontend/Dockerfile -t trip-service/frontend:latest .

# 또는 전체 스크립트 실행
.\scripts\start-dev-kube.ps1  # Windows PowerShell
./scripts/build-images.sh     # Linux/macOS
```

### 3. 배포 상태 확인
```bash
# 파드 상태 확인
kubectl get pods --all-namespaces

# 서비스 상태 확인
kubectl get services --all-namespaces

# 전체 리소스 확인
kubectl get all --all-namespaces
```

## 🛠️ 문제 해결

### 일반적인 문제들

#### 1. 네임스페이스 삭제 실패
```bash
# 특정 네임스페이스 강제 삭제
kubectl delete namespace <namespace-name> --grace-period=0 --force
```

#### 2. 파드 삭제 실패
```bash
# 특정 파드 강제 삭제
kubectl delete pod <pod-name> -n <namespace> --grace-period=0 --force
```

#### 3. Docker 리소스 정리 실패
```bash
# Docker 데몬 재시작 후 재시도
# Windows: Docker Desktop 재시작
# Linux: sudo systemctl restart docker
```

## 📝 주의사항

1. **백업**: 중요한 데이터가 있다면 미리 백업하세요
2. **권한**: 일부 명령어는 관리자 권한이 필요할 수 있습니다
3. **네트워크**: Docker 네트워크 삭제 시 기존 연결이 끊어질 수 있습니다
4. **이미지**: 모든 이미지가 삭제되므로 재빌드가 필요합니다

## 🔗 관련 문서

- [Kubernetes 공식 문서](https://kubernetes.io/docs/)
- [Docker 공식 문서](https://docs.docker.com/)
- [Docker Desktop 가이드](https://docs.docker.com/desktop/)

---

**마지막 업데이트**: 2025-09-23  
**작성자**: AI Assistant  
**버전**: 1.0.0
