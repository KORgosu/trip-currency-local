import React from 'react';
import styled from 'styled-components';
import RankingItem from './RankingItem';

const RankingListContainer = styled.div`
  width: 100%;
`;

const LoadingContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 3rem;
  color: #666;
  font-size: 1rem;
`;

const ErrorContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  color: #d63031;
  background: #ffe6e6;
  border-radius: 8px;
  margin: 1rem 0;
`;

const RetryButton = styled.button`
  background: #d63031;
  color: white;
  border: none;
  border-radius: 5px;
  padding: 0.5rem 1rem;
  margin-top: 1rem;
  cursor: pointer;
  transition: background-color 0.3s;
  
  &:hover {
    background: #b71c1c;
  }
`;

const EmptyContainer = styled.div`
  text-align: center;
  padding: 3rem;
  color: #666;
  font-size: 1rem;
`;

const LastUpdated = styled.div`
  text-align: center;
  font-size: 0.8rem;
  color: #666;
  margin-bottom: 1rem;
  padding: 0.5rem;
  background: #f8f9fa;
  border-radius: 5px;
`;

const RefreshButton = styled.button`
  background: none;
  border: none;
  color: #666;
  cursor: pointer;
  font-size: 0.8rem;
  padding: 0.25rem 0.5rem;
  border-radius: 3px;
  transition: all 0.2s;
  margin-left: 0.5rem;
  
  &:hover {
    background-color: #e9ecef;
    color: #333;
  }
`;

const RankingList = ({ 
  rankings = [], 
  loading = false, 
  error = null, 
  onRefresh = () => {},
  lastUpdated = null 
}) => {
  const formatLastUpdated = (timestamp) => {
    if (!timestamp) return null;
    const date = new Date(timestamp);
    return date.toLocaleTimeString('ko-KR', { 
      hour: '2-digit', 
      minute: '2-digit',
      second: '2-digit'
    });
  };

  if (loading) {
    return (
      <RankingListContainer>
        <LoadingContainer>
          📊 랭킹 데이터를 불러오는 중...
        </LoadingContainer>
      </RankingListContainer>
    );
  }

  if (error) {
    return (
      <RankingListContainer>
        <ErrorContainer>
          ❌ 랭킹 데이터를 불러올 수 없습니다
          <br />
          <small>{error}</small>
          <RetryButton onClick={onRefresh}>
            🔄 다시 시도
          </RetryButton>
        </ErrorContainer>
      </RankingListContainer>
    );
  }

  if (!rankings || rankings.length === 0) {
    return (
      <RankingListContainer>
        <EmptyContainer>
          📈 아직 랭킹 데이터가 없습니다
          <br />
          <small>국가를 선택하면 랭킹이 업데이트됩니다</small>
        </EmptyContainer>
      </RankingListContainer>
    );
  }

  return (
    <RankingListContainer>
      {lastUpdated && (
        <LastUpdated>
          마지막 업데이트: {formatLastUpdated(lastUpdated)}
          <RefreshButton onClick={onRefresh} title="수동 새로고침">
            🔄
          </RefreshButton>
        </LastUpdated>
      )}
      
      {rankings.map((ranking, index) => (
        <RankingItem 
          key={ranking.country_code} 
          ranking={ranking} 
          rank={ranking.rank || index + 1} 
        />
      ))}
    </RankingListContainer>
  );
};

export default RankingList;
