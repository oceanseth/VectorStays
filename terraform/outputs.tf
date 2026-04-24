output "bnbmesh_ai_nameservers" {
  description = "Paste these as custom DNS nameservers for bnbmesh.ai in Namecheap."
  value       = aws_route53_zone.bnbmesh_ai.name_servers
}

output "bnbmesh_com_nameservers" {
  description = "Paste these as custom DNS nameservers for bnbmesh.com in Namecheap."
  value       = aws_route53_zone.bnbmesh_com.name_servers
}

output "bnbmesh_ai_zone_id" {
  value = aws_route53_zone.bnbmesh_ai.zone_id
}

output "bnbmesh_com_zone_id" {
  value = aws_route53_zone.bnbmesh_com.zone_id
}
