terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.4"
    }
  }

  # Local state is fine for the hackathon. Promote to an S3 backend later:
  #
  # backend "s3" {
  #   bucket         = "bnbmesh-tfstate"
  #   key            = "dns/terraform.tfstate"
  #   region         = "us-east-1"
  #   dynamodb_table = "bnbmesh-tflock"
  #   encrypt        = true
  # }
}

provider "aws" {
  region = var.aws_region
}

# -----------------------------------------------------------------------------
# Route 53 hosted zones
#
# These were created by hand via `aws route53 create-hosted-zone` on 2026-04-24
# to get nameservers for Namecheap quickly. To bring Terraform in sync with
# the live state, run once:
#
#   terraform import aws_route53_zone.bnbmesh_ai  Z09575213DM2E5Q6W5P2O
#   terraform import aws_route53_zone.bnbmesh_com Z04972246Z5OHE34J2J4
#
# After that, `terraform plan` should be clean.
# -----------------------------------------------------------------------------

resource "aws_route53_zone" "bnbmesh_ai" {
  name    = "bnbmesh.ai"
  comment = "BnBMesh primary zone — managed in terraform/"

  tags = {
    Project = "bnbmesh"
    Env     = "prod"
  }
}

resource "aws_route53_zone" "bnbmesh_com" {
  name    = "bnbmesh.com"
  comment = "BnBMesh alias zone — redirects to .ai"

  tags = {
    Project = "bnbmesh"
    Env     = "prod"
  }
}

# -----------------------------------------------------------------------------
# Records
#
# Fill in var.app_ipv4 (or var.app_domain for a CNAME target) once you know
# where the app actually runs. Until then these stay commented out.
# -----------------------------------------------------------------------------

# resource "aws_route53_record" "ai_apex_a" {
#   zone_id = aws_route53_zone.bnbmesh_ai.zone_id
#   name    = "bnbmesh.ai"
#   type    = "A"
#   ttl     = 300
#   records = [var.app_ipv4]
# }
#
# resource "aws_route53_record" "ai_www" {
#   zone_id = aws_route53_zone.bnbmesh_ai.zone_id
#   name    = "www.bnbmesh.ai"
#   type    = "CNAME"
#   ttl     = 300
#   records = ["bnbmesh.ai"]
# }
#
# resource "aws_route53_record" "com_apex_redirect" {
#   zone_id = aws_route53_zone.bnbmesh_com.zone_id
#   name    = "bnbmesh.com"
#   type    = "A"
#   ttl     = 300
#   records = [var.app_ipv4]
# }
