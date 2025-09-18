#!/bin/bash

echo "🚀 Trip Currency Service 로컬 개발 환경 시작"
echo

echo "📋 1. 환경 변수 파일 복사..."
if [ ! -f .env ]; then
    cp env.example .env
    echo "✅ .env 파일이 생성되었습니다."
else
    echo "✅ .env 파일이 이미 존재합니다."
fi

echo
echo "🐳 2. Docker Compose로 서비스 시작..."
docker-compose up -d

echo
echo "📋 3. Kafka 토픽 초기화 스크립트 실행 권한 설정..."
docker exec currency-kafka-init chmod +x /init-kafka-topics.sh || echo "⚠️ Kafka 초기화 컨테이너가 아직 준비되지 않음"

echo
echo "⏳ 4. 서비스 초기화 대기 중... (30초)"
sleep 30

echo
echo "🔍 5. 서비스 상태 확인..."
echo
echo "Currency Service (포트 8000):"
curl -s http://localhost:8000/health >/dev/null 2>&1 && echo "✅ 준비됨" || echo "❌ 준비되지 않음"

echo
echo "Ranking Service (포트 8002):"
curl -s http://localhost:8002/health >/dev/null 2>&1 && echo "✅ 준비됨" || echo "❌ 준비되지 않음"

echo
echo "History Service (포트 8003):"
curl -s http://localhost:8003/health >/dev/null 2>&1 && echo "✅ 준비됨" || echo "❌ 준비되지 않음"

echo
echo "📊 6. 서비스 접속 정보:"
echo
echo "🌐 Currency Service: http://localhost:8000"
echo "🌐 Ranking Service:  http://localhost:8002"
echo "🌐 History Service:  http://localhost:8003"
echo "🌐 Kafka UI:         http://localhost:8081"
echo
echo "📚 API 문서:"
echo "🌐 Currency Service Docs: http://localhost:8000/docs"
echo "🌐 Ranking Service Docs:  http://localhost:8002/docs"
echo "🌐 History Service Docs:  http://localhost:8003/docs"
echo
echo "🛑 서비스를 중지하려면: docker-compose down"
echo
