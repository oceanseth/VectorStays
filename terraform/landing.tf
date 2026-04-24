# -----------------------------------------------------------------------------
# bnbmesh.ai + bnbmesh.com — static landing (S3) + serverless API (Lambda) all
# fronted by a single CloudFront distribution. /api/* goes to Lambda, everything
# else is the Vite build from S3.
# -----------------------------------------------------------------------------

locals {
  landing_domains = [
    "bnbmesh.ai",
    "www.bnbmesh.ai",
    "bnbmesh.com",
    "www.bnbmesh.com",
  ]
}

# -----------------------------------------------------------------------------
# S3 — static site bucket (private, reached only via CloudFront OAC)
# -----------------------------------------------------------------------------

resource "aws_s3_bucket" "landing" {
  bucket        = "bnbmesh-landing-${data.aws_caller_identity.current.account_id}"
  force_destroy = true

  tags = {
    Project = "bnbmesh"
    Env     = "prod"
  }
}

data "aws_caller_identity" "current" {}

resource "aws_s3_bucket_public_access_block" "landing" {
  bucket                  = aws_s3_bucket.landing.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "landing" {
  bucket = aws_s3_bucket.landing.id
  versioning_configuration { status = "Enabled" }
}

# -----------------------------------------------------------------------------
# Lambda — /api/* handler (Node 22, function URL)
# -----------------------------------------------------------------------------

data "archive_file" "api" {
  type        = "zip"
  source_dir  = "${path.module}/../api"
  output_path = "${path.module}/.build/api.zip"
  excludes    = [".git", "package-lock.json"]
  # Include node_modules so the redis client ships with the function.
}

resource "aws_iam_role" "api" {
  name = "bnbmesh-api"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "api_logs" {
  role       = aws_iam_role.api.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_lambda_function" "api" {
  function_name    = "bnbmesh-api"
  role             = aws_iam_role.api.arn
  runtime          = "nodejs22.x"
  handler          = "src/index.handler"
  filename         = data.archive_file.api.output_path
  source_code_hash = data.archive_file.api.output_base64sha256
  # Lambda timeout 60s so direct invokes (e.g. `aws lambda invoke ?live=1`) can
  # actually complete a TinyFish scrape that takes 30-50s. API Gateway HTTP API
  # still caps requests at 29s, so user-facing calls bail to mock at 22s.
  timeout          = 60
  memory_size      = 512

  environment {
    variables = {
      NODE_OPTIONS         = "--enable-source-maps"
      TINYFISH_API_KEY     = var.tinyfish_api_key
      REDIS_URL            = var.redis_url
      X402_PAYMENT_ADDRESS = var.x402_payment_address
    }
  }

  tags = { Project = "bnbmesh" }
}

# API Gateway HTTP API in front of the Lambda. Using this instead of a
# Lambda Function URL because the account's SCPs appear to block public
# Function URL invocations.
resource "aws_apigatewayv2_api" "api" {
  name          = "bnbmesh-api"
  protocol_type = "HTTP"
  cors_configuration {
    allow_origins = ["*"]
    allow_methods = ["GET", "POST", "OPTIONS"]
    allow_headers = ["content-type", "authorization", "x-payment"]
  }
}

resource "aws_apigatewayv2_integration" "api" {
  api_id                 = aws_apigatewayv2_api.api.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.api.invoke_arn
  integration_method     = "POST"
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "api" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "$default"
  target    = "integrations/${aws_apigatewayv2_integration.api.id}"
}

resource "aws_apigatewayv2_stage" "api" {
  api_id      = aws_apigatewayv2_api.api.id
  name        = "$default"
  auto_deploy = true
}

resource "aws_lambda_permission" "api_gw" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.api.execution_arn}/*/*"
}

# -----------------------------------------------------------------------------
# ACM — one cert with 4 SANs, DNS-validated via our Route 53 zones.
# Must be in us-east-1 for CloudFront (our provider region is us-east-1).
# -----------------------------------------------------------------------------

resource "aws_acm_certificate" "landing" {
  domain_name               = "bnbmesh.ai"
  subject_alternative_names = [
    "*.bnbmesh.ai",
    "bnbmesh.com",
    "*.bnbmesh.com",
  ]
  validation_method = "DNS"

  lifecycle { create_before_destroy = true }
}

resource "aws_route53_record" "cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.landing.domain_validation_options :
    dvo.domain_name => dvo
  }

  zone_id = endswith(each.value.domain_name, "bnbmesh.ai") ? aws_route53_zone.bnbmesh_ai.zone_id : aws_route53_zone.bnbmesh_com.zone_id

  name    = each.value.resource_record_name
  type    = each.value.resource_record_type
  ttl     = 60
  records = [each.value.resource_record_value]
  allow_overwrite = true
}

resource "aws_acm_certificate_validation" "landing" {
  certificate_arn         = aws_acm_certificate.landing.arn
  validation_record_fqdns = [for r in aws_route53_record.cert_validation : r.fqdn]
}

# -----------------------------------------------------------------------------
# CloudFront — two origins (S3 landing, Lambda API), one cert, four aliases.
# -----------------------------------------------------------------------------

resource "aws_cloudfront_origin_access_control" "landing" {
  name                              = "bnbmesh-landing-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

locals {
  # API Gateway invoke URL looks like https://xxx.execute-api.us-east-1.amazonaws.com
  # CloudFront needs the bare hostname for the origin.
  api_domain = split("/", aws_apigatewayv2_api.api.api_endpoint)[2]
}

resource "aws_cloudfront_distribution" "landing" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "bnbmesh landing + /api"
  default_root_object = "index.html"
  aliases             = local.landing_domains
  price_class         = "PriceClass_100"
  http_version        = "http2and3"

  origin {
    origin_id                = "landing-s3"
    domain_name              = aws_s3_bucket.landing.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.landing.id
  }

  origin {
    origin_id   = "landing-api"
    domain_name = local.api_domain
    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  default_cache_behavior {
    target_origin_id       = "landing-s3"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true
    # Managed: CachingOptimized
    cache_policy_id          = "658327ea-f89d-4fab-a63d-7e88639e58f6"
  }

  ordered_cache_behavior {
    path_pattern           = "/api/*"
    target_origin_id       = "landing-api"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true
    # Managed: CachingDisabled
    cache_policy_id          = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad"
    # Managed: AllViewerExceptHostHeader (FN URLs reject mismatched Host)
    origin_request_policy_id = "b689b0a8-53d0-40ab-baf2-68738e2966ac"
  }

  custom_error_response {
    error_code         = 403
    response_code      = 200
    response_page_path = "/index.html"
  }
  custom_error_response {
    error_code         = 404
    response_code      = 200
    response_page_path = "/index.html"
  }

  restrictions {
    geo_restriction { restriction_type = "none" }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.landing.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  tags = { Project = "bnbmesh" }
}

# CloudFront needs to be allowed to read from the S3 bucket (OAC).
resource "aws_s3_bucket_policy" "landing" {
  bucket = aws_s3_bucket.landing.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "AllowCloudFrontOAC"
      Effect    = "Allow"
      Principal = { Service = "cloudfront.amazonaws.com" }
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.landing.arn}/*"
      Condition = {
        StringEquals = {
          "AWS:SourceArn" = aws_cloudfront_distribution.landing.arn
        }
      }
    }]
  })
}

# -----------------------------------------------------------------------------
# Route 53 — point apex + www for both domains at CloudFront.
# -----------------------------------------------------------------------------

resource "aws_route53_record" "ai_apex" {
  zone_id = aws_route53_zone.bnbmesh_ai.zone_id
  name    = "bnbmesh.ai"
  type    = "A"
  alias {
    name                   = aws_cloudfront_distribution.landing.domain_name
    zone_id                = aws_cloudfront_distribution.landing.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "ai_www" {
  zone_id = aws_route53_zone.bnbmesh_ai.zone_id
  name    = "www.bnbmesh.ai"
  type    = "A"
  alias {
    name                   = aws_cloudfront_distribution.landing.domain_name
    zone_id                = aws_cloudfront_distribution.landing.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "com_apex" {
  zone_id = aws_route53_zone.bnbmesh_com.zone_id
  name    = "bnbmesh.com"
  type    = "A"
  alias {
    name                   = aws_cloudfront_distribution.landing.domain_name
    zone_id                = aws_cloudfront_distribution.landing.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "com_www" {
  zone_id = aws_route53_zone.bnbmesh_com.zone_id
  name    = "www.bnbmesh.com"
  type    = "A"
  alias {
    name                   = aws_cloudfront_distribution.landing.domain_name
    zone_id                = aws_cloudfront_distribution.landing.hosted_zone_id
    evaluate_target_health = false
  }
}

# -----------------------------------------------------------------------------
# Outputs
# -----------------------------------------------------------------------------

output "landing_bucket" {
  value = aws_s3_bucket.landing.bucket
}

output "cloudfront_distribution_id" {
  value = aws_cloudfront_distribution.landing.id
}

output "cloudfront_domain" {
  value = aws_cloudfront_distribution.landing.domain_name
}

output "api_gateway_url" {
  description = "Direct API Gateway invoke URL (for testing). Public via CloudFront at https://bnbmesh.ai/api/*."
  value       = aws_apigatewayv2_api.api.api_endpoint
}
