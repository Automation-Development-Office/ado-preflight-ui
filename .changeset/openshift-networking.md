---
"ado-preflight-ui": minor
---

Add centralized OpenShift Networking configuration with NSX-like operational model. Administrators express networking intent through tenant networks, security policies, physical networks, and north/south connectivity. PreFlight translates intent into supported OpenShift resources (UDN, CUDN, NetworkPolicy, AdminNetworkPolicy, EgressFirewall, NMState, MetalLB) and idempotent Ansible automation. Networking operates independently of OpenShift Virtualization but integrates with it when selected. Includes version-aware support matrix, resource preview, dependency calculation, and comprehensive validation.
