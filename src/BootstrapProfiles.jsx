import React, { useState } from 'react';
import { Checkbox, FormGroup, Grid, GridItem } from '@patternfly/react-core';
import { satelliteProfileOptions } from './profileSelection.mjs';

export const profiles = {
  openshift: {
    Core: ['openshift'],
    'Platform Essentials': ['openshift', 'cert_manager', 'rhbk', 'grafana', 'oadp'],
    DevSecOps: ['openshift', 'cert_manager', 'rhbk', 'acs', 'grafana', 'devspaces', 'dev_hub', 'gitops', 'quay'],
    Networking: ['openshift', 'openshift_networking'],
    Virtualization: ['openshift', 'ocp_virtualization', 'openshift_networking', 'oadp', 'grafana'],
    Compliance: ['openshift', 'ocp_compliance', 'acs'],
    'Full Platform': ['openshift', 'cert_manager', 'rhbk', 'grafana', 'oadp', 'acs', 'devspaces', 'dev_hub', 'gitops', 'quay', 'ocp_virtualization', 'openshift_networking', 'acm', 'ocp_compliance']
  },
  rhel: {
    AAP: ['rhel', 'aap'],
    Satellite: ['rhel', 'satellite'],
    'Identity / IdM': ['rhel', 'idm'],
    Monitoring: ['rhel', 'grafana'],
    Patching: ['rhel', 'satellite', 'idm'],
    'STIG / Compliance': ['rhel', 'compliance', 'stig'],
    'Full Platform': ['rhel', 'aap', 'satellite', 'idm', 'grafana', 'compliance', 'stig']
  },
  satellite: {
    Server: ['satellite'],
    'Client Satellite Registration': ['satellite'],
    'Content view': ['satellite'],
    Capsule: ['satellite'],
    'Dynamic inventory': ['satellite'],
    'OIDC / Keycloak': ['satellite'],
    'Full Satellite': ['satellite']
  }
};

const targets = {
  openshift: 'OpenShift',
  rhel: 'Standalone / RHEL',
  satellite: 'Satellite',
  patching: 'Patching',
  aws: 'AWS',
  provision: 'Provisioning'
};
const signature = (apps, options = []) => `${[...apps].sort().join(',')}|${[...options].sort().join(',')}`;

export default function BootstrapProfiles({ data, getApps, onTarget, onApps, isDark, borderColor, mutedTextColor, fieldBg, fieldColor }) {
  const [chosen, setChosen] = useState({});
  const [mode, setMode] = useState('disconnected');
  const all = data.components.includes('all');
  const active = Object.keys(targets).filter(group => all || data.components.includes(group));
  const helpStyle = { color: mutedTextColor, fontSize: '13px', marginBottom: '10px' };
  const inputStyle = { width: '100%', padding: '8px', border: `1px solid ${borderColor}`, borderRadius: '4px', background: fieldBg, color: fieldColor };
  return <Grid hasGutter>
    <GridItem span={12} md={8}>
      <FormGroup label="Target Platform">
        <div style={helpStyle}>Select the platforms you want to configure. Combine targets for a hybrid environment.</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px 24px' }}>
          {Object.entries(targets).map(([group, title]) => <Checkbox key={group} id={`profile-target-${group}`} label={title} isChecked={active.includes(group)} onChange={() => onTarget(group)} />)}
        </div>
      </FormGroup>
    </GridItem>
    <GridItem span={12} md={4}>
      <FormGroup label="Deployment Mode">
        <div style={helpStyle}>Choose your environment’s connectivity.</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px 24px' }}>
          {['disconnected', 'connected'].map(value => <Checkbox key={value} id={`profile-mode-${value}`} label={value === 'connected' ? 'Connected' : 'Disconnected'} isChecked={mode === value} onChange={() => setMode(value)} />)}
        </div>
      </FormGroup>
    </GridItem>
    {all && <GridItem span={12}><div style={helpStyle}>All components selected. Choose a profile to customize a target.</div></GridItem>}
    {active.map(group => {
      const apps = getApps(group);
      const selected = all ? apps : (data.component_apps?.[group] || []);
      const selectedOptions = group === 'satellite' ? (data.component_options?.satellite || []) : [];
      const choice = chosen[group];
      const current = choice?.signature === signature(selected, selectedOptions) ? choice.name : 'Custom';
      const change = (next, name = 'Custom') => {
        const nextOptions = group === 'satellite' && name !== 'Custom' && satelliteProfileOptions[name]
          ? satelliteProfileOptions[name]
          : selectedOptions;
        onApps(group, next, () => setChosen(prev => ({ ...prev, [group]: { name, signature: signature(next, nextOptions) } })), name);
      };
      return <GridItem key={group} span={12}>
        <div style={{ padding: '12px', border: `1px solid ${borderColor}`, borderRadius: '6px', background: isDark ? '#1f1f1f' : '#fafafa' }}>
          <Grid hasGutter>
            <GridItem span={12} md={6}>
              <div style={{ fontWeight: 700, marginBottom: '4px' }}>{targets[group]}</div>
              <div style={helpStyle}>Choose a profile to auto-select components in Component Configuration below.</div>
            </GridItem>
            <GridItem span={12} md={6}>
              <FormGroup label="Profile" fieldId={`profile-${group}`}>
                <select id={`profile-${group}`} aria-label={`${targets[group]} profile`} style={inputStyle} value={current} onChange={event => {
                  const name = event.target.value;
                  change(name === 'Custom' ? selected : profiles[group][name], name);
                }}>
                  <option>Custom</option>
                  {Object.keys(profiles[group] || {}).map(name => <option key={name}>{name}</option>)}
                </select>
              </FormGroup>
            </GridItem>
          </Grid>
        </div>
      </GridItem>;
    })}
  </Grid>;
}
