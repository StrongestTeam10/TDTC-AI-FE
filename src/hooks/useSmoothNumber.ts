import { useState, useEffect, useRef } from 'react';

/**
 * 숫자가 급격하게 변할 때 부드럽게 트랜지션(카운트 업/다운)을 적용하는 훅
 */
export function useSmoothNumber(targetValue: number, duration: number = 500) {
  const [currentValue, setCurrentValue] = useState(targetValue);
  
  // 현재 애니메이션이 도달한 '가장 최신 위치'를 기억하는 변수
  const currentValRef = useRef(targetValue);

  useEffect(() => {
    if (targetValue === currentValRef.current) return;

    // 새로운 목표값이 들어온 순간의 위치를 '출발점'으로 영구 고정
    const startValue = currentValRef.current;
    const change = targetValue - startValue;
    
    let startTimestamp: number | null = null;
    let animationId: number;

    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      
      const easeProgress = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      
      const nextValue = startValue + change * easeProgress;
      
      setCurrentValue(nextValue);
      currentValRef.current = nextValue; // 최신 위치 업데이트

      if (progress < 1) {
        // 끝나지 않았으면 다음 프레임 예약 (ID를 덮어씀)
        animationId = requestAnimationFrame(step);
      } else {
        // 완벽하게 도달
        setCurrentValue(targetValue);
        currentValRef.current = targetValue;
      }
    };

    animationId = requestAnimationFrame(step);
    
    // 컴포넌트가 꺼지거나 새로운 목표값이 들어오면 '기존 애니메이션'을 완벽하게 취소! (중첩 폭주 방지)
    return () => cancelAnimationFrame(animationId);
  }, [targetValue, duration]);

  return currentValue;
}
