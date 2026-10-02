# OpenShift Networking in PreFlight

## Purpose

OpenShift Networking adds a centralized, NSX-like networking management experience to
PreFlight. An administrator expresses networking intent through the UI, and PreFlight
translates that intent into supported Red Hat OpenShift resources and idempotent
Ansible automation.

This is **not** an NSX compatibility layer. It is an OpenShift-native networking
abstraction that provides a familiar operational model for infrastructure administrators
accustomed to VMware NSX Manager.

## Architecture Decision

**Networking is independent of OpenShift Virtualization.**

OpenShift Networking is added as a first-class OpenShift application (`openshift_networking`)
in the existing component system. It does not require OpenShift Virtualization to be
selected. The hierarchy is:

```
OpenShift Cluster
  -> OpenShift Networking
       -> optional: OpenShift Virtualization integration
       -> optional: Kubernetes NMState
       -> optional: MetalLB
       -> optional: SR-IOV (future)
```

OpenShift Virtualization is an important *consumer* of the networking framework. When
both are selected, the UI exposes VM-compatible options and validates configurations
against OpenShift Virtualization constraints.

## NSX Conceptual Mapping

These are conceptual parallels, not API equivalents:

| NSX Concept | OpenShift Equivalent |
|---|---|
| Tenant / Project | Tenant grouping + Namespaces |
| Segment (Overlay) | UserDefinedNetwork / ClusterUserDefinedNetwork |
| Segment (VLAN) | Localnet + NMState + Physical Network Mapping |
| Distributed Firewall | NetworkPolicy + AdminNetworkPolicy + BaselineAdminNetworkPolicy |
| Tier-0 / Tier-1 Gateway | No direct equivalent. EgressIP, IngressController, Routes |
| Edge Node | No direct equivalent. OVN-Kubernetes on all nodes; MetalLB for L2/BGP |
| NAT | EgressIP (SNAT), Services/Routes (DNAT) |

## Tenant Networks

A **Tenant Network** is a logical PreFlight object that may generate several OpenShift
resources. It represents:

- **Tenant** - a logical grouping name
- **Namespaces** - one or more OpenShift namespaces
- **Network Segment** - a UDN, CUDN, or NAD
- **Security** - network policies per tenant
- **Connectivity** - egress configuration

### Example

```
Tenant: Finance
Namespaces: finance-apps, finance-vms
Network: finance-network (Primary Layer2 CUDN)
CIDR: 10.100.10.0/24
IPAM: Persistent
Workloads: Containers + VMs
Security: Default Deny
```

## Overlay Networks

Overlay networks use OVN-Kubernetes and do not require NMState or physical network
configuration.

Supported resource types:
- **UserDefinedNetwork** (namespace-scoped)
- **ClusterUserDefinedNetwork** (cluster-scoped with namespace selector)

Topologies:
- **Layer2** - flat L2 domain, no routing between subnets
- **Layer3** - routed, requires per-node host subnets

Roles:
- **Primary** - replaces the default pod network for selected namespaces.
  Requires `k8s.ovn.org/primary-user-defined-network` namespace label.
- **Secondary** - additional network alongside the default pod network

## Physical / VLAN-Backed Networks

Physical networks connect to the data center switching fabric. They require:

1. **Kubernetes NMState Operator** for node network configuration
2. **NodeNetworkConfigurationPolicy (NNCP)** for bridge/bond/VLAN setup
3. **OVN localnet mapping** to connect OVN to the physical bridge

Physical networks are defined as reusable objects that tenant networks can reference.

## Network Security

### Namespace-level: NetworkPolicy
Standard Kubernetes NetworkPolicy for namespace and application workloads.
Templates: none, default-deny, default-deny-all, allow-same-tenant, custom.

### Cluster-level: AdminNetworkPolicy
Cluster administrator policy with defined priority. Takes precedence over
namespace NetworkPolicy where applicable (OCP 4.17+ GA).

### Cluster-level: BaselineAdminNetworkPolicy
Cluster-level baseline applied when no higher-priority rule matches.

### Secondary networks: MultiNetworkPolicy
For secondary network interfaces. Only applicable where supported.

### Egress: EgressFirewall
Per-namespace egress rules with Allow/Deny by CIDR or DNS name.
One EgressFirewall per namespace.

## North/South Connectivity

### MetalLB
Bare-metal LoadBalancer implementation. Only installed when selected.
Supports L2 and BGP advertisement modes.

### EgressIP
Source NAT for namespace egress traffic. Configured per tenant.

### IngressController
Configuration for additional ingress controllers or internal vs external
publishing strategy.

## Dependencies

Dependencies are selected based on requested functionality:

| Feature | Dependency |
|---|---|
| Any UDN/CUDN | OVN-Kubernetes (built-in) |
| Physical/VLAN network | Kubernetes NMState Operator |
| Bare-metal LoadBalancer | MetalLB Operator |
| VM workloads | OpenShift Virtualization |

Only operators required by selected functionality are installed.

## Support Matrix

The UI uses a centralized capability matrix to validate feature combinations.
Key dimensions:
- OpenShift version (4.14 - 4.22)
- Network provider (OVN-Kubernetes required for UDN)
- Resource type (UDN, CUDN, NAD)
- Scope (namespace, cluster)
- Role (Primary, Secondary)
- Topology (Layer2, Layer3, Localnet)
- Workload type (containers, VMs)
- Feature status (GA, Tech Preview, Unsupported)

The matrix is version-aware and filters available options based on the
target OpenShift release.

## OpenShift Virtualization Integration

When OpenShift Virtualization is selected:
- VM-compatible networks are highlighted
- Primary Layer2 with Persistent IPAM is defaulted for VM workloads
- Unsupported topologies for VMs are disabled with explanations
- Secondary network options include bridge and SR-IOV where available

VM live migration requires:
- Primary UDN
- Layer2 topology
- Persistent IPAM lifecycle

## Technology Preview Features

Features that are Technology Preview in the target OCP version:
- Are hidden by default or placed behind an advanced toggle
- Display a clear "Tech Preview" badge
- Are not included in production-safe default workflows
- Require deliberate administrator selection

## PreFlight JSON

Networking configuration lives in `component_config.openshift_networking`:

```json
{
  "component_config": {
    "openshift_networking": {
      "enabled": true,
      "ocp_version": "4.18",
      "network_provider": "OVNKubernetes",
      "tenants": [...],
      "cluster_security": {...},
      "physical_networks": [...],
      "ingress": {...},
      "load_balancing": {...}
    }
  }
}
```

When networking is not enabled, the key is excluded from the payload.
Stale configuration does not generate automation.

## Generated OpenShift Resources

Each resource is generated only when its triggering configuration is present:

| Resource | Trigger |
|---|---|
| Namespace | Tenant namespace with create: true |
| UserDefinedNetwork | Namespace-scoped overlay network |
| ClusterUserDefinedNetwork | Cluster-scoped overlay network |
| NetworkAttachmentDefinition | Localnet or secondary bridge/SR-IOV |
| NetworkPolicy | Tenant security enabled |
| AdminNetworkPolicy | Cluster security policies configured |
| BaselineAdminNetworkPolicy | Baseline policy configured |
| MultiNetworkPolicy | Secondary network policy |
| EgressFirewall | Tenant egress rules |
| EgressIP | Tenant EgressIP enabled |
| NMState | Physical network with NMState |
| NodeNetworkConfigurationPolicy | Physical network bridge/bond |
| MetalLB | MetalLB enabled |
| IPAddressPool | MetalLB address pool |
| L2Advertisement | MetalLB L2 mode |
| BGPAdvertisement | MetalLB BGP mode |
| BGPPeer | MetalLB BGP peering |
| Subscription + OperatorGroup | Required operator not yet installed |

## Ansible Workflow

The generated automation follows this dependency order:

1. Validate cluster/network provider compatibility
2. Install NMState Operator (if physical networks selected)
3. Install MetalLB Operator (if MetalLB selected)
4. Create NMState instance and NNCPs
5. Configure MetalLB instance, pools, advertisements
6. Create tenant namespaces with required labels
7. Create UDN/CUDN/NAD resources
8. Apply network policies
9. Apply egress resources
10. Validate resources

## OpenShift Version Considerations

- UDN/CUDN: GA availability varies by OCP version and topology
- AdminNetworkPolicy: GA in OCP 4.17+
- Primary UDN for VMs: Requires OCP 4.17+ with appropriate support
- Localnet via CUDN: Check version-specific support

## Limitations and Deferred Capabilities

**Not implemented:**
- SR-IOV (model supports future addition)
- BGP routing / VRF
- Advanced MetalLB with community pools
- DNS integration
- IPAM integrations beyond static
- GitOps delivery mode
- Network observability / flow visibility
- Policy visualization
- NSX Tier-0/Tier-1 gateway equivalents (no OpenShift equivalent)

**Intentionally omitted NSX concepts:**
- NSX Edge Node (no OpenShift equivalent)
- NSX Transport Zone (OVN-Kubernetes manages this internally)
- NSX Logical Router (OpenShift routing model differs fundamentally)
