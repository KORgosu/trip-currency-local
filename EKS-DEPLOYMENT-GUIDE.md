# EKS 배포 완전 가이드

## 📋 사전 준비사항

### 1. AWS CLI 설치 및 설정
```bash
# AWS CLI 설치 확인
aws --version

# AWS 자격증명 설정
aws configure
# Access Key ID: YOUR_ACCESS_KEY
# Secret Access Key: YOUR_SECRET_KEY
# Default region: us-west-2
# Default output format: json
```

### 2. 필수 도구 설치
```bash
# eksctl 설치 (Linux/Mac)
curl --silent --location "https://github.com/weaveworks/eksctl/releases/latest/download/eksctl_$(uname -s)_amd64.tar.gz" | tar xz -C /tmp
sudo mv /tmp/eksctl /usr/local/bin

# kubectl 설치 (이미 설치되어 있다면 스킵)
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
sudo install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl

# Docker 설치 (이미 설치되어 있다면 스킵)
```

## 🚀 1단계: EKS 클러스터 생성

### A. 클러스터 생성
```bash
# EKS 클러스터 생성 (15-20분 소요)
eksctl create cluster \
  --name trip-service-cluster \
  --region us-west-2 \
  --version 1.28 \
  --nodegroup-name trip-service-nodes \
  --node-type t3.medium \
  --nodes 3 \
  --nodes-min 2 \
  --nodes-max 5 \
  --managed

# kubectl 컨텍스트 설정
aws eks update-kubeconfig --region us-west-2 --name trip-service-cluster

# 클러스터 확인
kubectl get nodes
```

### B. 필수 애드온 설치
```bash
# AWS Load Balancer Controller 설치
curl -O https://raw.githubusercontent.com/kubernetes-sigs/aws-load-balancer-controller/v2.6.0/docs/install/iam_policy.json

aws iam create-policy \
    --policy-name AWSLoadBalancerControllerIAMPolicy \
    --policy-document file://iam_policy.json

# ServiceAccount 생성
eksctl create iamserviceaccount \
  --cluster=trip-service-cluster \
  --namespace=kube-system \
  --name=aws-load-balancer-controller \
  --role-name AmazonEKSLoadBalancerControllerRole \
  --attach-policy-arn=arn:aws:iam::ACCOUNT-ID:policy/AWSLoadBalancerControllerIAMPolicy \
  --approve

# Helm으로 컨트롤러 설치
helm repo add eks https://aws.github.io/eks-charts
helm repo update

helm install aws-load-balancer-controller eks/aws-load-balancer-controller \
  -n kube-system \
  --set clusterName=trip-service-cluster \
  --set serviceAccount.create=false \
  --set serviceAccount.name=aws-load-balancer-controller

# EBS CSI Driver 설치 (영구 볼륨용)
eksctl create iamserviceaccount \
  --name ebs-csi-controller-sa \
  --namespace kube-system \
  --cluster trip-service-cluster \
  --attach-policy-arn arn:aws:iam::aws:policy/service-role/Amazon_EBS_CSI_DriverPolicy \
  --approve \
  --role-only \
  --role-name AmazonEKS_EBS_CSI_DriverRole

eksctl create addon --name aws-ebs-csi-driver --cluster trip-service-cluster --service-account-role-arn arn:aws:iam::ACCOUNT-ID:role/AmazonEKS_EBS_CSI_DriverRole
```

## 🐳 2단계: ECR 설정 및 이미지 업로드

### A. ECR 레포지토리 생성
```bash
# ECR 레포지토리들 생성
aws ecr create-repository --repository-name trip-service/frontend --region us-west-2
aws ecr create-repository --repository-name trip-service/currency --region us-west-2
aws ecr create-repository --repository-name trip-service/history --region us-west-2
aws ecr create-repository --repository-name trip-service/ranking --region us-west-2
aws ecr create-repository --repository-name trip-service/dataingestor --region us-west-2

# ECR 로그인
aws ecr get-login-password --region us-west-2 | docker login --username AWS --password-stdin ACCOUNT-ID.dkr.ecr.us-west-2.amazonaws.com
```

### B. 이미지 빌드 및 푸시
```bash
# 현재 이미지들을 ECR 형태로 태깅
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION=us-west-2

# Frontend
docker tag korgosu/service-frontend:prod-latest $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/trip-service/frontend:latest
docker push $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/trip-service/frontend:latest

# Currency Service
docker tag korgosu/service-currency:prod-latest $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/trip-service/currency:latest
docker push $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/trip-service/currency:latest

# History Service
docker tag korgosu/service-history:prod-latest $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/trip-service/history:latest
docker push $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/trip-service/history:latest

# Ranking Service
docker tag korgosu/service-ranking:prod-latest $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/trip-service/ranking:latest
docker push $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/trip-service/ranking:latest

# DataIngestor Service
docker tag korgosu/service-dataingestor:prod-latest $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/trip-service/dataingestor:latest
docker push $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/trip-service/dataingestor:latest
```

## ⚙️ 3단계: EKS용 Kustomization 업데이트

### A. EKS 오버레이 수정
```bash
# Account ID와 Region으로 kustomization.yaml 업데이트
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

# sed로 Account ID 교체
sed -i "s/123456789012/$ACCOUNT_ID/g" k8s/overlays/eks/kustomization.yaml
```

### B. EKS용 Ingress 설정 생성
```yaml
# k8s/overlays/eks/ingress.yaml 파일 생성
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: trip-service-alb
  annotations:
    kubernetes.io/ingress.class: alb
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
    alb.ingress.kubernetes.io/healthcheck-path: /health
spec:
  rules:
  - http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: service-frontend
            port:
              number: 80
      - path: /api/v1/currencies
        pathType: Prefix
        backend:
          service:
            name: service-currency
            port:
              number: 8000
      - path: /api/v1/rankings
        pathType: Prefix
        backend:
          service:
            name: service-ranking
            port:
              number: 8000
      - path: /api/v1/history
        pathType: Prefix
        backend:
          service:
            name: service-history
            port:
              number: 8000
```

### C. StorageClass 설정
```yaml
# k8s/overlays/eks/storageclass.yaml 파일 생성
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: gp3-encrypted
provisioner: ebs.csi.aws.com
parameters:
  type: gp3
  encrypted: "true"
  fsType: ext4
volumeBindingMode: WaitForFirstConsumer
allowVolumeExpansion: true
```

## 🚢 4단계: EKS 배포 실행

### A. 네임스페이스 생성
```bash
kubectl create namespace trip-service-prod
```

### B. Secrets 생성 (필요시)
```bash
# MySQL 패스워드 등 민감 정보 설정
kubectl create secret generic trip-service-secrets \
  --from-literal=mysql-password=your-secure-password \
  --from-literal=mongodb-password=your-secure-password \
  -n trip-service-prod
```

### C. 배포 실행
```bash
# EKS 환경으로 배포
kubectl apply -k k8s/overlays/eks/

# 배포 상태 확인
kubectl get pods -n trip-service-prod

# 서비스 상태 확인
kubectl get services -n trip-service-prod

# Ingress 확인 (ALB URL 획득)
kubectl get ingress -n trip-service-prod
```

## 🔍 5단계: 배포 검증

### A. 파드 상태 확인
```bash
# 모든 파드가 Running 상태인지 확인
kubectl get pods -n trip-service-prod

# 특정 서비스 로그 확인
kubectl logs -l app=service-currency -n trip-service-prod
```

### B. 서비스 연결성 테스트
```bash
# 내부 서비스 테스트
kubectl run test-pod --image=curlimages/curl -i --tty --rm -n trip-service-prod -- sh

# 테스트 팟에서 실행:
# curl http://service-currency:8000/health
# curl http://service-history:8000/health
# curl http://service-ranking:8000/health
```

### C. 외부 접근 테스트
```bash
# ALB URL 확인
ALB_URL=$(kubectl get ingress trip-service-alb -n trip-service-prod -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')

# 브라우저나 curl로 접근 테스트
curl http://$ALB_URL
curl http://$ALB_URL/api/v1/currencies/health
```

## 📊 6단계: 모니터링 설정 (선택사항)

### A. CloudWatch 인사이트 활성화
```bash
# CloudWatch 로그 그룹 생성
aws logs create-log-group --log-group-name /aws/eks/trip-service-cluster/cluster

# Fluent Bit 설치 (로그 수집)
kubectl apply -f https://raw.githubusercontent.com/aws-samples/amazon-cloudwatch-container-insights/latest/k8s-deployment-manifest-templates/deployment-mode/daemonset/container-insights-monitoring/cloudwatch-namespace.yaml

kubectl apply -f https://raw.githubusercontent.com/aws-samples/amazon-cloudwatch-container-insights/latest/k8s-deployment-manifest-templates/deployment-mode/daemonset/container-insights-monitoring/fluent-bit/fluent-bit.yaml
```

## 🔧 7단계: 운영 관리

### A. 스케일링
```bash
# 수평 파드 오토스케일러 설정
kubectl autoscale deployment service-currency --cpu-percent=70 --min=2 --max=10 -n trip-service-prod

# 클러스터 오토스케일러 설정
eksctl create iamserviceaccount \
  --cluster trip-service-cluster \
  --namespace kube-system \
  --name cluster-autoscaler \
  --attach-policy-arn arn:aws:iam::aws:policy/AutoScalingFullAccess \
  --approve
```

### B. 백업 설정
```bash
# Velero 설치 (백업 및 재해복구)
velero install \
    --provider aws \
    --plugins velero/velero-plugin-for-aws:v1.8.0 \
    --bucket trip-service-backups \
    --secret-file ./credentials-velero \
    --backup-location-config region=us-west-2
```

## 🎯 배포 완료 체크리스트

- [ ] EKS 클러스터 생성 완료
- [ ] ECR에 모든 이미지 업로드 완료
- [ ] 필수 애드온 설치 완료
- [ ] 애플리케이션 배포 완료
- [ ] 모든 파드가 Running 상태
- [ ] ALB를 통한 외부 접근 가능
- [ ] API 서비스들이 정상 응답
- [ ] 데이터베이스 연결 정상
- [ ] 모니터링 설정 완료

## 🚨 트러블슈팅

### 일반적인 문제들
1. **이미지 Pull 실패**: ECR 권한 확인
2. **LoadBalancer 생성 실패**: AWS Load Balancer Controller 설치 확인
3. **PV 생성 실패**: EBS CSI Driver 설치 확인
4. **네트워킹 이슈**: 보안그룹 및 VPC 설정 확인

### 유용한 명령어들
```bash
# 클러스터 정보 확인
eksctl get cluster --region us-west-2

# 노드 상태 확인
kubectl describe nodes

# 이벤트 확인
kubectl get events --sort-by='.lastTimestamp' -n trip-service-prod

# 로그 스트리밍
kubectl logs -f deployment/service-currency -n trip-service-prod
```

이 가이드를 따라하면 완전히 동작하는 EKS 환경에서 Trip Service를 운영할 수 있습니다! 🚀