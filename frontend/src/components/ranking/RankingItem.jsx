import React from 'react';
import styled from 'styled-components';

const RankingItemContainer = styled.div`
  display: flex;
  align-items: center;
  padding: 0.75rem;
  border-radius: 8px;
  background: white;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  margin-bottom: 0.5rem;
  transition: all 0.2s;
  
  &:hover {
    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    transform: translateY(-1px);
  }
`;

const RankNumber = styled.div`
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  font-size: 0.9rem;
  margin-right: 1rem;
  
  ${props => {
    if (props.rank === 1) return 'background: linear-gradient(135deg, #ffd700, #ffed4e); color: #8b6914;';
    if (props.rank === 2) return 'background: linear-gradient(135deg, #c0c0c0, #e8e8e8); color: #666;';
    if (props.rank === 3) return 'background: linear-gradient(135deg, #cd7f32, #daa520); color: white;';
    return 'background: #f8f9fa; color: #666;';
  }}
`;

const CountryInfo = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
`;

const CountryName = styled.div`
  font-weight: 600;
  color: #2c3e50;
  font-size: 1rem;
  margin-bottom: 0.25rem;
`;

const CountryCode = styled.div`
  font-size: 0.8rem;
  color: #666;
  text-transform: uppercase;
`;

const SelectionCount = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.25rem;
`;

const CountRow = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-end;
`;

const CountNumber = styled.div`
  font-size: 1.1rem;
  font-weight: bold;
  color: #667eea;
`;

const TotalCountNumber = styled.div`
  font-size: 0.9rem;
  font-weight: bold;
  color: #95a5a6;
`;

const CountLabel = styled.div`
  font-size: 0.65rem;
  color: #666;
  margin-top: 0.1rem;
`;

const TotalCountLabel = styled.div`
  font-size: 0.6rem;
  color: #999;
  margin-top: 0.1rem;
`;

const TrendingIcon = styled.span`
  margin-left: 0.5rem;
  font-size: 0.8rem;
`;

const RankingItem = ({ ranking, rank }) => {
  const getTrendingIcon = () => {
    // 간단한 트렌드 표시 (실제로는 이전 데이터와 비교해야 함)
    const random = Math.random();
    if (random > 0.7) return '📈';
    if (random < 0.3) return '📉';
    return '➡️';
  };

  return (
    <RankingItemContainer>
      <RankNumber rank={rank}>
        {rank}
      </RankNumber>
      
      <CountryInfo>
        <CountryName>
          {ranking.country_name}
          <TrendingIcon>{getTrendingIcon()}</TrendingIcon>
        </CountryName>
        <CountryCode>{ranking.country_code}</CountryCode>
      </CountryInfo>
      
      <SelectionCount>
        <CountRow>
          <CountNumber>{ranking.daily_clicks}</CountNumber>
          <CountLabel>오늘 클릭</CountLabel>
        </CountRow>
        <CountRow>
          <TotalCountNumber>{ranking.total_clicks}</TotalCountNumber>
          <TotalCountLabel>총 클릭</TotalCountLabel>
        </CountRow>
      </SelectionCount>
    </RankingItemContainer>
  );
};

export default RankingItem;
