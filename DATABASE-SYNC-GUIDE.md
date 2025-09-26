# 로컬-EKS 데이터베이스 동기화 가이드

## 🎯 동기화 전략 선택 가이드

### 상황별 최적 전략

| 요구사항 | 추천 전략 | 장점 | 단점 |
|---------|----------|------|------|
| 실시간 동기화 필요 | MySQL 복제 + CDC | 지연시간 최소, 실시간 | 복잡성, 네트워크 의존 |
| 준실시간 허용 | Kafka 이벤트 스트리밍 | 유연성, 확장성 | 일관성 지연 |
| 배치 처리 허용 | 정기 ETL | 간단함, 안정성 | 실시간성 부족 |
| 고가용성 필요 | Multi-Master + Consul | 무중단, 양방향 | 충돌 해결 복잡 |

## 🚀 방법 1: Kafka 기반 이벤트 스트리밍 (권장)

### A. 아키텍처
```
로컬 서비스 → 로컬 Kafka → EKS Kafka → EKS 서비스
     ↓              ↓              ↓         ↓
로컬 MySQL ←→ 동기화 서비스 ←→ 동기화 서비스 ←→ EKS MySQL
```

### B. 로컬 환경 설정
```yaml
# k8s/base/kafka/kafka-connect.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: kafka-connect
spec:
  replicas: 1
  selector:
    matchLabels:
      app: kafka-connect
  template:
    metadata:
      labels:
        app: kafka-connect
    spec:
      containers:
      - name: kafka-connect
        image: confluentinc/cp-kafka-connect:7.4.0
        ports:
        - containerPort: 8083
        env:
        - name: CONNECT_BOOTSTRAP_SERVERS
          value: "service-kafka:9092"
        - name: CONNECT_REST_ADVERTISED_HOST_NAME
          value: "kafka-connect"
        - name: CONNECT_REST_PORT
          value: "8083"
        - name: CONNECT_GROUP_ID
          value: "trip-service-connect"
        - name: CONNECT_CONFIG_STORAGE_TOPIC
          value: "connect-configs"
        - name: CONNECT_OFFSET_STORAGE_TOPIC
          value: "connect-offsets"
        - name: CONNECT_STATUS_STORAGE_TOPIC
          value: "connect-status"
        - name: CONNECT_KEY_CONVERTER
          value: "org.apache.kafka.connect.json.JsonConverter"
        - name: CONNECT_VALUE_CONVERTER
          value: "org.apache.kafka.connect.json.JsonConverter"
        - name: CONNECT_PLUGIN_PATH
          value: "/usr/share/java,/usr/share/confluent-hub-components"
```

### C. MySQL CDC (Change Data Capture) 설정
```json
{
  "name": "mysql-source-connector",
  "config": {
    "connector.class": "io.debezium.connector.mysql.MySqlConnector",
    "database.hostname": "service-mysql",
    "database.port": "3306",
    "database.user": "trip_user",
    "database.password": "trip-service-user",
    "database.server.id": "12345",
    "database.server.name": "trip-local",
    "database.include.list": "currency_db",
    "table.include.list": "currency_db.exchange_rate_history,currency_db.rankings",
    "database.history.kafka.bootstrap.servers": "service-kafka:9092",
    "database.history.kafka.topic": "schema-changes-trip-local",
    "include.schema.changes": "true",
    "transforms": "route",
    "transforms.route.type": "org.apache.kafka.connect.transforms.RegexRouter",
    "transforms.route.regex": "([^.]+)\\.([^.]+)\\.([^.]+)",
    "transforms.route.replacement": "sync.$3"
  }
}
```

### D. 크로스 클러스터 Kafka 미러링
```yaml
# k8s/overlays/eks/kafka-mirror-maker.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: kafka-mirror-maker
spec:
  replicas: 1
  selector:
    matchLabels:
      app: kafka-mirror-maker
  template:
    metadata:
      labels:
        app: kafka-mirror-maker
    spec:
      containers:
      - name: kafka-mirror-maker
        image: confluentinc/cp-kafka:7.4.0
        command:
        - /bin/bash
        - -c
        - |
          kafka-mirror-maker \
            --consumer.config /etc/kafka-mirror-maker/consumer.properties \
            --producer.config /etc/kafka-mirror-maker/producer.properties \
            --whitelist 'sync\..*'
        volumeMounts:
        - name: config
          mountPath: /etc/kafka-mirror-maker
      volumes:
      - name: config
        configMap:
          name: kafka-mirror-maker-config
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: kafka-mirror-maker-config
data:
  consumer.properties: |
    bootstrap.servers=YOUR-LOCAL-KAFKA-EXTERNAL-IP:9092
    group.id=mirror-maker-consumer
    auto.offset.reset=earliest
  producer.properties: |
    bootstrap.servers=service-kafka:9092
    acks=all
    retries=3
```

## 🔄 방법 2: Database Replication (실시간)

### A. MySQL Master-Slave 설정
```bash
# 1. 로컬에서 외부 접근 설정
kubectl patch service service-mysql -n trip-service-prod -p '{"spec":{"type":"LoadBalancer"}}'

# 2. 로컬 MySQL을 Master로 설정
kubectl exec -it mysql-pod -n trip-service-prod -- mysql -u root -p << 'EOF'
# Master 설정
SET GLOBAL binlog_format = 'ROW';
SET GLOBAL gtid_mode = 'ON';
SET GLOBAL enforce_gtid_consistency = 'ON';

# 복제 사용자 생성
CREATE USER 'replication_user'@'%' IDENTIFIED BY 'secure_repl_password';
GRANT REPLICATION SLAVE ON *.* TO 'replication_user'@'%';
FLUSH PRIVILEGES;

# Master 상태 확인
SHOW MASTER STATUS;
EOF

# 3. EKS MySQL을 Slave로 설정
kubectl exec -it mysql-pod -n trip-service-prod -- mysql -u root -p << 'EOF'
# Slave 설정
SET GLOBAL read_only = 1;

# Master 연결 설정
CHANGE MASTER TO
  MASTER_HOST='YOUR-LOCAL-EXTERNAL-IP',
  MASTER_USER='replication_user',
  MASTER_PASSWORD='secure_repl_password',
  MASTER_AUTO_POSITION = 1;

# 복제 시작
START SLAVE;

# 복제 상태 확인
SHOW SLAVE STATUS\G;
EOF
```

### B. 네트워크 연결 설정
```yaml
# 로컬 MySQL 외부 노출
apiVersion: v1
kind: Service
metadata:
  name: mysql-external
spec:
  selector:
    app: mysql
  ports:
  - port: 3306
    targetPort: 3306
    nodePort: 30306
  type: NodePort
```

## 📊 방법 3: 배치 ETL (간단함)

### A. 동기화 CronJob 생성
```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: db-sync-cronjob
spec:
  schedule: "*/10 * * * *"  # 10분마다 실행
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: db-sync
            image: your-account.dkr.ecr.us-west-2.amazonaws.com/db-sync:latest
            env:
            - name: LOCAL_DB_HOST
              value: "YOUR-LOCAL-EXTERNAL-IP"
            - name: LOCAL_DB_PORT
              value: "30306"
            - name: EKS_DB_HOST
              value: "service-mysql"
            - name: EKS_DB_PORT
              value: "3306"
            - name: DB_USER
              valueFrom:
                secretKeyRef:
                  name: db-sync-secrets
                  key: username
            - name: DB_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: db-sync-secrets
                  key: password
          restartPolicy: OnFailure
```

### B. 동기화 스크립트 예시
```python
# sync-script.py
import asyncio
import aiomysql
import os
from datetime import datetime, timedelta

class DatabaseSyncer:
    def __init__(self):
        self.local_config = {
            'host': os.getenv('LOCAL_DB_HOST'),
            'port': int(os.getenv('LOCAL_DB_PORT')),
            'user': os.getenv('DB_USER'),
            'password': os.getenv('DB_PASSWORD'),
            'db': 'currency_db'
        }
        self.eks_config = {
            'host': os.getenv('EKS_DB_HOST'),
            'port': int(os.getenv('EKS_DB_PORT')),
            'user': os.getenv('DB_USER'),
            'password': os.getenv('DB_PASSWORD'),
            'db': 'currency_db'
        }

    async def sync_exchange_rates(self):
        # 로컬에서 최근 데이터 조회
        local_conn = await aiomysql.connect(**self.local_config)
        async with local_conn.cursor() as cursor:
            await cursor.execute("""
                SELECT * FROM exchange_rate_history
                WHERE created_at > %s
            """, (datetime.now() - timedelta(minutes=15),))
            new_data = await cursor.fetchall()

        if not new_data:
            return

        # EKS에 데이터 복제
        eks_conn = await aiomysql.connect(**self.eks_config)
        async with eks_conn.cursor() as cursor:
            for row in new_data:
                await cursor.execute("""
                    INSERT IGNORE INTO exchange_rate_history
                    (id, currency_code, rate, created_at, updated_at)
                    VALUES (%s, %s, %s, %s, %s)
                """, row)
            await eks_conn.commit()

        print(f"동기화 완료: {len(new_data)}개 레코드")

async def main():
    syncer = DatabaseSyncer()
    await syncer.sync_exchange_rates()

if __name__ == "__main__":
    asyncio.run(main())
```

## 🏗️ 방법 4: Multi-Master 구성 (고가용성)

### A. Galera Cluster 설정
```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: mysql-galera
spec:
  serviceName: mysql-galera
  replicas: 3
  selector:
    matchLabels:
      app: mysql-galera
  template:
    metadata:
      labels:
        app: mysql-galera
    spec:
      containers:
      - name: mysql
        image: mariadb:10.6-focal
        env:
        - name: MYSQL_ROOT_PASSWORD
          valueFrom:
            secretKeyRef:
              name: mysql-secret
              key: root-password
        - name: WSREP_CLUSTER_ADDRESS
          value: "gcomm://mysql-galera-0.mysql-galera,mysql-galera-1.mysql-galera,mysql-galera-2.mysql-galera"
        command:
        - /bin/bash
        - -c
        - |
          if [[ $HOSTNAME =~ -0$ ]]; then
            exec docker-entrypoint.sh mysqld --wsrep-new-cluster
          else
            exec docker-entrypoint.sh mysqld
          fi
```

## 🔧 동기화 모니터링 및 관리

### A. 동기화 상태 체크 서비스
```python
from fastapi import FastAPI
import asyncio
import aiomysql
import json

app = FastAPI()

@app.get("/sync/status")
async def get_sync_status():
    # 로컬과 EKS의 데이터 일관성 체크
    local_count = await get_record_count("local")
    eks_count = await get_record_count("eks")

    return {
        "local_records": local_count,
        "eks_records": eks_count,
        "sync_lag": abs(local_count - eks_count),
        "status": "healthy" if abs(local_count - eks_count) < 10 else "warning"
    }

@app.post("/sync/force")
async def force_sync():
    # 수동 동기화 트리거
    result = await trigger_manual_sync()
    return {"message": "동기화 시작", "job_id": result}
```

### B. AlertManager 설정
```yaml
groups:
- name: database-sync
  rules:
  - alert: DatabaseSyncLag
    expr: sync_lag > 100
    for: 5m
    labels:
      severity: warning
    annotations:
      summary: "데이터베이스 동기화 지연"
      description: "로컬-EKS 간 데이터 동기화가 {{ $value }}개 레코드 지연되고 있습니다."
```

## 📋 동기화 전략 비교

| 방법 | 지연시간 | 복잡도 | 안정성 | 비용 | 권장 사용처 |
|------|----------|--------|--------|------|-------------|
| MySQL 복제 | 즉시 | 중간 | 높음 | 낮음 | 읽기 중심, 실시간 |
| Kafka CDC | 초단위 | 높음 | 높음 | 중간 | 이벤트 기반, 확장성 |
| 배치 ETL | 분단위 | 낮음 | 중간 | 낮음 | 정기 동기화, 단순함 |
| Multi-Master | 즉시 | 높음 | 중간 | 높음 | 양방향, 고가용성 |

## 🎯 권장 구성

**단계적 접근:**

1. **1단계**: 배치 ETL로 시작 (빠른 구현)
2. **2단계**: Kafka CDC로 업그레이드 (실시간성)
3. **3단계**: MySQL 복제 추가 (고가용성)

**최종 아키텍처:**
```
로컬 환경: MySQL Master + Kafka + 배치 ETL
    ↓ (실시간 복제 + 이벤트 스트리밍)
EKS 환경: MySQL Slave + Kafka + 동기화 모니터링
```

이렇게 구성하면 실시간 동기화와 안정성을 모두 확보할 수 있습니다! 🚀