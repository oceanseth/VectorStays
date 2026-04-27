#!/usr/bin/env bash
# Source-of-truth: SSM Parameter Store at /bnbmesh/production/*
# Run this BEFORE `terraform apply` to hydrate Stripe (and any future) secrets:
#
#   source terraform/load-ssm.sh
#   cd terraform && terraform apply
#
# Each var is exported as TF_VAR_<name> so terraform picks them up automatically
# without having to edit terraform.tfvars.

set -e
SSM_BASE="${SSM_BASE:-/bnbmesh/production}"

ssm_get () {
  aws ssm get-parameter --name "$1" --with-decryption \
    --query 'Parameter.Value' --output text 2>/dev/null || true
}

export TF_VAR_stripe_secret_key="$(ssm_get "$SSM_BASE/stripe_secret_key")"
export TF_VAR_stripe_price_id="$(ssm_get "$SSM_BASE/stripe_price_id")"
export TF_VAR_stripe_webhook_secret="$(ssm_get "$SSM_BASE/stripe_webhook_secret")"

echo "loaded SSM:"
echo "  stripe_secret_key:     $([ -n "$TF_VAR_stripe_secret_key" ] && echo set || echo MISSING)"
echo "  stripe_price_id:       $([ -n "$TF_VAR_stripe_price_id" ] && echo "$TF_VAR_stripe_price_id" || echo MISSING)"
echo "  stripe_webhook_secret: $([ -n "$TF_VAR_stripe_webhook_secret" ] && echo set || echo MISSING)"
