---
"ado-preflight-ui": minor
---

Add the Shift on Shift OpenShift app: a tab to define one or more hosted clusters on the HyperShift KubeVirt platform (name, namespace, release image, worker VM count/CPU/memory, root disk and etcd storage classes, networking and API/ingress endpoints, pull secret source, optional disconnected mirrors and trust bundle) with inline validation and a review summary. Run Bootstrap stops on Shift on Shift input problems. Set up missing prerequisites (on by default) lets the deploy job install the multicluster engine Operator, OpenShift Virtualization, and MetalLB (with the entered address pool) when the cluster lacks them. Pasted pull secrets stay in the encrypted vault file. Bootstrap generates validate, deploy, status, scale, update, access, and delete job templates backed by infra.automation_development_office.
