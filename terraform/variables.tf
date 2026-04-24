variable "aws_region" {
  description = "AWS region for the provider. Route 53 is global, but the provider needs one."
  type        = string
  default     = "us-east-1"
}

variable "app_ipv4" {
  description = "IPv4 address of the app server (EC2 public IP, ALB A-alias target, etc.)."
  type        = string
  default     = ""
}

variable "app_domain" {
  description = "Optional alternative target for CNAME-style records (e.g. vision.vectorstays.com)."
  type        = string
  default     = ""
}

variable "tinyfish_api_key" {
  description = "TinyFish API key for live agentic web search (set via terraform.tfvars or TF_VAR_tinyfish_api_key)."
  type        = string
  default     = ""
  sensitive   = true
}

variable "redis_url" {
  description = "Redis URL (redis://user:pass@host:port). L2 cache + agent memory layer."
  type        = string
  default     = ""
  sensitive   = true
}

variable "x402_payment_address" {
  description = "On-chain address for x402 demo payments (base-sepolia)."
  type        = string
  default     = "0x0000000000000000000000000000000000000000"
}

variable "vapi_private_key" {
  description = "Vapi private API key (for server-side call control + assistant management)."
  type        = string
  default     = ""
  sensitive   = true
}
