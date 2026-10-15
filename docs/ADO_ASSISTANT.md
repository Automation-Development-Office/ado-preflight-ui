# ADO Assistant preview

The drawer is a UI prototype with local README retrieval and curated form
navigation. It does not currently run a language model. Guided workflows cover:

- **Install AAP on OpenShift**
- **Not using AAP** (generate the playbook repo in the pod, then run generated playbooks)

Ask / search also covers curated topics such as **NFS CSI / NFS StorageClass**
(`infra.ado.ocp_nfs_storage`, preflight ``nfs_csi`` option) and ACM Fleet Management.

All bundled role READMEs are available for lookup, including their examples.
Unknown role names do not produce fabricated examples. The historical/misspelled
`install_keycloak` / `install_keyclaok` names are explicitly identified as
unavailable and mapped to the actual `install_rhbk` README if it is present in
the selected collection.

## Offline knowledge

`scripts/build-assistant-knowledge.py` reads every README from the newest bundled
`collections/infra-ado-*.tar.gz`, plus tracked UI READMEs. The generated JSON records
the archive name and SHA-256. Nothing is fetched from the network. The container
regenerates this bundle from its baked archive during image build. Source builds
must refresh it before `npm run build`. The UI renders documentation as plain
text, never as executable HTML. No model or deployment action is inferred from
README instructions. Questions and answers are kept only in browser memory.

## Proposed same-pod inference, pending assets

The eventual inference runtime belongs in a container in the Preflight pod and
must use a model already in the offline delivery or preloaded storage. Preflight
must not download models at startup or depend on another host. UI walkthrough
controls remain allowlisted and independent of generated model text. Do not send
form passwords, API tokens, or raw preflight exports into model context.

No model weights, runtime image, or third-party AI documentation have been
redistributed as part of this preview. Hardware requirements and model quality
have not been benchmarked. The following are candidates, not installed components
or assertions of commercial support:

- Red Hat's RHEL 10 disconnected command-line assistant is documented as a
  **Developer Preview**, intended for a single system. Its installer is not a
  drop-in Preflight pod sidecar. See the official [disconnected assistant
  documentation](https://docs.redhat.com/en/documentation/red_hat_enterprise_linux/10/html/interacting_with_the_command-line_assistant/containerized-command-line-assistant-for-disconnected-environments).
- Red Hat AI Inference is a containerized serving option. Choose its exact image,
  model format, and resource requirements against the [supported configurations](https://docs.redhat.com/en/documentation/red_hat_ai/3/html/supported_product_and_hardware_configurations/about-supported-configurations_supported-configurations).
- IBM Granite is a candidate for a locally served model. The official
  [Granite 4.0 micro model card](https://huggingface.co/ibm-granite/granite-4.0-micro)
  identifies Apache-2.0 licensing. This is not a determination that every runtime,
  quantization, image, or model variant has the same terms or Red Hat support.

Before adding binary assets, pin the model revision, runtime digest, and checksums;
retain the applicable LICENSE/NOTICE files; and review runtime/subscription and
redistribution terms separately. Red Hat's [validated-model documentation](https://docs.redhat.com/en/documentation/red_hat_ai/3/html-single/validated_models/validated_models)
explicitly notes that third-party models retain their original provider licenses.
No blanket license clearance is claimed here.

## Verification

- `python3 scripts/build-assistant-knowledge.py`
- `node --test tests/assistant-knowledge.test.mjs`
- `npm run build`
- Browser: open/close drawer; Show me highlights Install AAP or Not using AAP
  targets without changing values; role lookup displays the actual README; mobile
  Show me closes the drawer so the target remains visible.

Full model inference and disconnected container deployment remain untested until
model/runtime assets are supplied and built. The preview does not change the
preflight JSON contract, ADO role behavior, or bootstrap execution.
