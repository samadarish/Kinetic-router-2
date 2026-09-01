import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AtSign, Bell, CalendarDays, LockKeyhole, Mail, Save, ShieldCheck, UserRound } from 'lucide-react';
import type { PortalUser } from '@kineticrouter/portal-contract';
import { Badge, Button, Card, ErrorState, LoadingState, PageHeader } from '../components/Ui';
import { useAuth } from '../lib/auth';
import { jsonBody, portalApi } from '../lib/api';
import { formatDate, formatMoney } from '../lib/format';

export function ProfilePage() {
  const client = useQueryClient();
  const { capabilities, refresh } = useAuth();
  const query = useQuery({ queryKey:['profile'], queryFn:() => portalApi<PortalUser>('/me') });
  const [username,setUsername] = useState(''); const [avatarUrl,setAvatarUrl] = useState('');
  const [oldPassword,setOldPassword] = useState(''); const [newPassword,setNewPassword] = useState(''); const [confirmPassword,setConfirmPassword] = useState('');
  const [notice,setNotice] = useState('');
  useEffect(() => { if(query.data){setUsername(query.data.username);setAvatarUrl(query.data.avatarUrl ?? '');} },[query.data]);
  const updateProfile = useMutation({ mutationFn:()=>portalApi<PortalUser>('/me',{method:'PATCH',...jsonBody({username,avatarUrl:avatarUrl || null})}), onSuccess:async()=>{setNotice('Profile updated.');await client.invalidateQueries({queryKey:['profile']});await refresh();} });
  const updatePassword = useMutation({ mutationFn:()=>portalApi('/me/password',{method:'PUT',...jsonBody({oldPassword,newPassword})}), onSuccess:()=>{setOldPassword('');setNewPassword('');setConfirmPassword('');setNotice('Password updated.');} });
  function saveProfile(event:FormEvent){event.preventDefault();updateProfile.mutate();}
  function savePassword(event:FormEvent){event.preventDefault();if(newPassword!==confirmPassword){setNotice('New passwords do not match.');return;}setNotice('');updatePassword.mutate();}
  if(query.isLoading)return <><PageHeader title="Profile"/><LoadingState label="Loading profile"/></>;
  if(query.error||!query.data)return <><PageHeader title="Profile"/><ErrorState error={query.error} retry={()=>void query.refetch()}/></>;
  const user=query.data;
  return <>
    <PageHeader title="Profile" description="Manage your identity, notifications, and sign-in credentials." />
    <div className="profile-layout">
      <aside><Card className="identity-card"><span className="profile-avatar">{user.avatarUrl?<img src={user.avatarUrl} alt=""/>:(user.username||user.email).slice(0,1).toUpperCase()}</span><h2>{user.username}</h2><p>{user.email}</p><Badge tone={user.status==='active'?'success':'neutral'}>{user.status}</Badge><dl><div><dt><AtSign size={14}/>Account ID</dt><dd className="mono">{user.id}</dd></div><div><dt><CalendarDays size={14}/>Member since</dt><dd>{formatDate(user.createdAt)}</dd></div><div><dt><ShieldCheck size={14}/>Role</dt><dd>{user.role}</dd></div><div><dt><Mail size={14}/>Email</dt><dd>{user.emailBound===false?'Unbound':'Verified'}</dd></div></dl><div className="identity-balance"><span>Available balance</span><strong>{formatMoney(user.balance)}</strong><small>{user.concurrency} concurrent requests</small></div></Card></aside>
      <section className="profile-sections">
        <Card className="settings-card"><header><span><UserRound size={18}/></span><div><h2>Personal information</h2><p>Shown across your customer console.</p></div></header><form onSubmit={saveProfile} className="settings-form"><label className="field"><span>Username</span><input className="field-input" value={username} onChange={(event)=>setUsername(event.target.value)} required disabled={!capabilities?.profileWrites}/></label><label className="field"><span>Avatar URL <small>Optional</small></span><input className="field-input" type="url" value={avatarUrl} onChange={(event)=>setAvatarUrl(event.target.value)} placeholder="https://example.com/avatar.png" disabled={!capabilities?.profileWrites}/></label>{updateProfile.error&&<div className="form-error">{updateProfile.error instanceof Error?updateProfile.error.message:'Update failed.'}</div>}<div className="form-actions"><Button disabled={!capabilities?.profileWrites||updateProfile.isPending}><Save size={15}/>{updateProfile.isPending?'Saving…':'Save profile'}</Button></div></form></Card>
        <Card className="settings-card"><header><span><LockKeyhole size={18}/></span><div><h2>Change password</h2><p>Use a strong password you don’t reuse elsewhere.</p></div></header><form onSubmit={savePassword} className="settings-form"><label className="field"><span>Current password</span><input className="field-input" type="password" autoComplete="current-password" value={oldPassword} onChange={(event)=>setOldPassword(event.target.value)} required disabled={!capabilities?.profileWrites}/></label><div className="two-fields"><label className="field"><span>New password</span><input className="field-input" type="password" autoComplete="new-password" minLength={8} value={newPassword} onChange={(event)=>setNewPassword(event.target.value)} required disabled={!capabilities?.profileWrites}/></label><label className="field"><span>Confirm password</span><input className="field-input" type="password" autoComplete="new-password" minLength={8} value={confirmPassword} onChange={(event)=>setConfirmPassword(event.target.value)} required disabled={!capabilities?.profileWrites}/></label></div>{updatePassword.error&&<div className="form-error">{updatePassword.error instanceof Error?updatePassword.error.message:'Password update failed.'}</div>}<div className="form-actions"><Button disabled={!capabilities?.profileWrites||updatePassword.isPending}><LockKeyhole size={15}/>{updatePassword.isPending?'Updating…':'Update password'}</Button></div></form></Card>
        <Card className="settings-card muted-setting"><header><span><Bell size={18}/></span><div><h2>Account bindings</h2><p>Email notification and OAuth bindings follow the capabilities enabled in Sub2API.</p></div></header><div className="binding-row"><span><Mail size={16}/>Email address</span><strong>{user.email}</strong><Badge tone={user.emailBound===false?'neutral':'success'}>{user.emailBound===false?'Unbound':'Bound'}</Badge></div><div className="binding-row disabled"><span><ShieldCheck size={16}/>Authenticator & passkeys</span><strong>{capabilities?.totp||capabilities?.passkeys?'Available in Sub2API settings':'Not enabled'}</strong><Badge>{capabilities?.totp||capabilities?.passkeys?'Available':'Unavailable'}</Badge></div></Card>
      </section>
    </div>
    {notice&&<div className="toast" role="status">{notice}</div>}
  </>;
}
