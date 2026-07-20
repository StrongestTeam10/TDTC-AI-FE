#!/bin/bash
# 수동 배포 스크립트 (CloudFront Distribution ID 발급 후 아래 변수 채울 것)
set -e

S3_BUCKET="market-digital-twin-frontend"
CLOUDFRONT_DISTRIBUTION_ID=""  # CloudFront 배포 생성 후 이 값을 채워야 캐시 무효화가 동작함

npm run build

aws s3 sync dist/ "s3://${S3_BUCKET}" --delete

if [ -n "$CLOUDFRONT_DISTRIBUTION_ID" ]; then
  aws cloudfront create-invalidation \
    --distribution-id "$CLOUDFRONT_DISTRIBUTION_ID" \
    --paths "/*"
else
  echo "CLOUDFRONT_DISTRIBUTION_ID가 비어있어 캐시 무효화를 건너뜁니다."
fi
