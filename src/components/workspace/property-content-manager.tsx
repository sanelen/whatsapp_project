'use client';

import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import {
  importFields,
  type AuthoritativeMedia,
  type AuthoritativeProperty,
  type AuthoritativeRoom,
  type PropertyContentSnapshot,
  type PropertyImportField,
  type PropertyImportMapping,
  type PropertyImportPreview,
  type PropertyMediaKind,
} from '@/lib/property-content';

type Section = 'facts' | 'media' | 'import';
type ImportResponse = {
  fileName: string;
  format: string;
  preview: PropertyImportPreview;
};

const inputClass =
  'mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100';
const labelClass = 'block text-xs font-bold uppercase tracking-[0.12em] text-slate-500';
const buttonClass =
  'rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50';

function blankRoom(propertyId: string): AuthoritativeRoom {
  return {
    id: '',
    propertyId,
    label: '',
    description: '',
    unitType: 'room',
    contactPrimary: '',
    contactSecondary: '',
    rentAmount: 0,
    depositAmount: 0,
    depositTerms: '',
    occupancy: 'occupied',
    isAvailable: false,
    availableFrom: '',
    parking: '',
    ensuite: false,
    maxOccupants: 1,
    features: [],
    viewingInstructions: '',
    descriptiveContentApproved: false,
  };
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className={labelClass}>
      {label}
      <input
        type={type}
        value={value}
        min={type === 'number' ? 0 : undefined}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={inputClass}
      />
    </label>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
}) {
  return (
    <label className={labelClass}>
      {label}
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={4}
        className={inputClass}
      />
      {hint ? <span className="mt-1.5 block text-xs font-normal normal-case tracking-normal text-slate-500">{hint}</span> : null}
    </label>
  );
}

function ApprovalToggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 accent-blue-600"
      />
      <span>
        <strong className="block">{label}</strong>
        <span className="mt-0.5 block text-xs leading-5 text-amber-800">
          Only approved descriptive copy is eligible for vector retrieval. Structured price, deposit, availability, viewing, contacts, and links never enter that vector text.
        </span>
      </span>
    </label>
  );
}

function statusTone(status: string) {
  return /saved|applied|uploaded|approved|updated/i.test(status)
    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
    : 'border-rose-200 bg-rose-50 text-rose-700';
}

export function PropertyContentManager({ propertyId }: { propertyId: string }) {
  const [snapshot, setSnapshot] = useState<PropertyContentSnapshot | null>(null);
  const [property, setProperty] = useState<AuthoritativeProperty | null>(null);
  const [room, setRoom] = useState<AuthoritativeRoom>(() => blankRoom(propertyId));
  const [section, setSection] = useState<Section>('facts');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(true);
  const [mediaUnitId, setMediaUnitId] = useState('');
  const [mediaKind, setMediaKind] = useState<PropertyMediaKind>('photo');
  const [mediaCaption, setMediaCaption] = useState('');
  const [mediaAltText, setMediaAltText] = useState('');
  const [mediaOrder, setMediaOrder] = useState(0);
  const [mediaApproved, setMediaApproved] = useState(false);
  const [externalUrl, setExternalUrl] = useState('');
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<ImportResponse | null>(null);
  const [mapping, setMapping] = useState<PropertyImportMapping>({});

  async function load() {
    const response = await fetch(`/api/property-content?propertyId=${encodeURIComponent(propertyId)}`, {
      cache: 'no-store',
    });
    const payload = await response.json() as { success: boolean; data?: PropertyContentSnapshot; error?: string };
    if (!response.ok || !payload.success || !payload.data) throw new Error(payload.error || 'Property content could not be loaded.');
    setSnapshot(payload.data);
    setProperty(payload.data.property);
    setRoom((current) => {
      if (!current.id) return payload.data?.rooms[0] || blankRoom(propertyId);
      return payload.data?.rooms.find((item) => item.id === current.id) || payload.data?.rooms[0] || blankRoom(propertyId);
    });
  }

  useEffect(() => {
    let active = true;
    fetch(`/api/property-content?propertyId=${encodeURIComponent(propertyId)}`, { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json() as { success: boolean; data?: PropertyContentSnapshot; error?: string };
        if (!response.ok || !payload.success || !payload.data) throw new Error(payload.error || 'Property content could not be loaded.');
        return payload.data;
      })
      .then((data) => {
        if (!active) return;
        setSnapshot(data);
        setProperty(data.property);
        setRoom(data.rooms[0] || blankRoom(propertyId));
      })
      .catch((error: unknown) => {
        if (active) setStatus(error instanceof Error ? error.message : 'Property content could not be loaded.');
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => { active = false; };
  }, [propertyId]);

  const approvedMediaCount = useMemo(
    () => snapshot?.media.filter((item) => item.isApproved).length || 0,
    [snapshot]
  );

  async function postJson(body: unknown, successMessage: string) {
    setBusy(true);
    setStatus('');
    try {
      const response = await fetch('/api/property-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await response.json() as { success: boolean; data?: PropertyContentSnapshot; error?: string };
      if (!response.ok || !payload.success) throw new Error(payload.error || 'The change could not be saved.');
      if (payload.data) {
        setSnapshot(payload.data);
        setProperty(payload.data.property);
        setRoom((current) => payload.data?.rooms.find((item) => item.id === current.id) || payload.data?.rooms[0] || blankRoom(propertyId));
      }
      setStatus(successMessage);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'The change could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  async function sendForm(formData: FormData, successMessage: string) {
    setBusy(true);
    setStatus('');
    try {
      const response = await fetch('/api/property-content', { method: 'POST', body: formData });
      const payload = await response.json() as { success: boolean; data?: unknown; error?: string };
      if (!response.ok || !payload.success) throw new Error(payload.error || 'The action could not be completed.');
      setStatus(successMessage);
      await load();
      return payload.data;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'The action could not be completed.');
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  async function saveProperty() {
    if (!property) return;
    await postJson({ action: 'updateProperty', propertyId, property }, 'Property facts saved and retrieval boundaries refreshed.');
  }

  async function saveRoom() {
    await postJson({ action: 'upsertRoom', propertyId, room }, room.id ? 'Room facts updated.' : 'Room created.');
  }

  async function saveExternalMedia() {
    if (!externalUrl.trim()) {
      setStatus('Add an external Google Photos or other http(s) media URL.');
      return;
    }
    await postJson({
      action: 'upsertExternalMedia',
      propertyId,
      media: {
        unitId: mediaUnitId,
        kind: mediaKind,
        externalUrl,
        caption: mediaCaption,
        altText: mediaAltText,
        displayOrder: mediaOrder,
        isApproved: mediaApproved,
      },
    }, 'External media reference saved.');
    setExternalUrl('');
    setMediaCaption('');
    setMediaAltText('');
  }

  async function uploadMedia() {
    if (!mediaFile) {
      setStatus('Choose a media file to upload.');
      return;
    }
    const formData = new FormData();
    formData.set('action', 'uploadMedia');
    formData.set('propertyId', propertyId);
    formData.set('unitId', mediaUnitId);
    formData.set('kind', mediaKind);
    formData.set('caption', mediaCaption);
    formData.set('altText', mediaAltText);
    formData.set('displayOrder', String(mediaOrder));
    formData.set('isApproved', String(mediaApproved));
    formData.set('file', mediaFile);
    await sendForm(formData, `Uploaded ${mediaFile.name} to the private uploads bucket.`);
    setMediaFile(null);
    setMediaCaption('');
    setMediaAltText('');
  }

  async function setApproval(item: AuthoritativeMedia, approved: boolean) {
    await postJson(
      { action: 'setMediaApproval', propertyId, mediaId: item.id, approved },
      approved ? 'Media approved for customer-facing use.' : 'Media removed from approved customer-facing content.'
    );
  }

  async function previewImport() {
    if (!importFile) {
      setStatus('Choose a CSV, JSON, XLS, or XLSX file.');
      return;
    }
    setBusy(true);
    setStatus('');
    try {
      const formData = new FormData();
      formData.set('action', 'previewImport');
      formData.set('propertyId', propertyId);
      formData.set('file', importFile);
      if (Object.keys(mapping).length) formData.set('mapping', JSON.stringify(mapping));
      const response = await fetch('/api/property-content', { method: 'POST', body: formData });
      const payload = await response.json() as { success: boolean; data?: ImportResponse; error?: string };
      if (!response.ok || !payload.success || !payload.data) throw new Error(payload.error || 'Import preview failed.');
      setImportPreview(payload.data);
      setMapping(payload.data.preview.mapping);
      setStatus('Mapping preview created. Review every mapped column and validation result before applying.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Import preview failed.');
    } finally {
      setBusy(false);
    }
  }

  async function refreshPreview(nextMapping: PropertyImportMapping) {
    setMapping(nextMapping);
    if (!importFile) return;
    setBusy(true);
    try {
      const formData = new FormData();
      formData.set('action', 'previewImport');
      formData.set('propertyId', propertyId);
      formData.set('file', importFile);
      formData.set('mapping', JSON.stringify(nextMapping));
      const response = await fetch('/api/property-content', { method: 'POST', body: formData });
      const payload = await response.json() as { success: boolean; data?: ImportResponse; error?: string };
      if (!response.ok || !payload.success || !payload.data) throw new Error(payload.error || 'Import preview failed.');
      setImportPreview(payload.data);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Import preview failed.');
    } finally {
      setBusy(false);
    }
  }

  async function applyImport() {
    if (!importFile || !importPreview?.preview.canApply) return;
    const formData = new FormData();
    formData.set('action', 'applyImport');
    formData.set('propertyId', propertyId);
    formData.set('file', importFile);
    formData.set('mapping', JSON.stringify(mapping));
    const result = await sendForm(formData, `Applied ${importPreview.preview.rows.length} reviewed structured row${importPreview.preview.rows.length === 1 ? '' : 's'}.`);
    if (result) {
      setImportFile(null);
      setImportPreview(null);
      setMapping({});
    }
  }

  if (!property || !snapshot) {
    return (
      <section className="min-w-0 flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-5xl rounded-2xl border border-slate-200 bg-white p-6">
          <p className="text-sm text-slate-600">{busy ? 'Loading authoritative property content…' : status || 'Property content is unavailable.'}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="min-w-0 flex-1 overflow-y-auto bg-slate-50/70 p-4 lg:p-7" data-testid="property-content-manager">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="rounded-[24px] border border-white/70 bg-white/90 p-5 shadow-sm backdrop-blur">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">Authoritative content</p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-950">{property.name}</h1>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
                Structured facts control decisions. Approved descriptive copy supports natural conversation but cannot override price, deposit, availability, viewing, or media records.
              </p>
            </div>
            <div className="flex gap-2 text-xs font-semibold">
              <span className="rounded-full bg-blue-50 px-3 py-1.5 text-blue-700">{snapshot.rooms.length} rooms</span>
              <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-emerald-700">{approvedMediaCount} approved media</span>
              <span className="rounded-full bg-slate-100 px-3 py-1.5 text-slate-600">Private: {snapshot.storage.bucket}</span>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-2" role="tablist" aria-label="Property content sections">
            {(['facts', 'media', 'import'] as Section[]).map((item) => (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={section === item}
                onClick={() => setSection(item)}
                className={`rounded-xl px-4 py-2 text-sm font-semibold capitalize transition ${
                  section === item ? 'bg-slate-950 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {item === 'facts' ? 'Facts & rooms' : item}
              </button>
            ))}
          </div>
        </header>

        {status ? (
          <div className={`rounded-xl border px-4 py-3 text-sm ${statusTone(status)}`} role="status">
            {status}
          </div>
        ) : null}

        {section === 'facts' ? (
          <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
            <form className="space-y-5 rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm" onSubmit={(event) => { event.preventDefault(); void saveProperty(); }}>
              <div>
                <h2 className="text-lg font-black text-slate-950">Property facts</h2>
                <p className="mt-1 text-sm text-slate-500">Public links and staff-confirmed operational facts remain structured.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Property name" value={property.name} onChange={(name) => setProperty({ ...property, name })} />
                <Field label="Area" value={property.area} onChange={(area) => setProperty({ ...property, area })} />
              </div>
              <TextAreaField
                label="Descriptive copy"
                value={property.description}
                onChange={(description) => setProperty({ ...property, description })}
                hint="This is the only property copy eligible for vector retrieval when approved."
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Street address" value={property.address} onChange={(address) => setProperty({ ...property, address })} />
                <Field label="Google Maps URL" type="url" value={property.mapsUrl} onChange={(mapsUrl) => setProperty({ ...property, mapsUrl })} />
                <Field label="Public property page" type="url" value={property.publicPageUrl} onChange={(publicPageUrl) => setProperty({ ...property, publicPageUrl })} />
                <Field label="Google Photos / gallery" type="url" value={property.photosUrl} onChange={(photosUrl) => setProperty({ ...property, photosUrl })} />
                <Field label="Pamphlet URL" type="url" value={property.pamphletUrl} onChange={(pamphletUrl) => setProperty({ ...property, pamphletUrl })} />
                <Field label="Parking" value={property.parking} onChange={(parking) => setProperty({ ...property, parking })} />
                <Field label="Primary contact" value={property.contactPrimary} onChange={(contactPrimary) => setProperty({ ...property, contactPrimary })} />
                <Field label="Secondary contact" value={property.contactSecondary} onChange={(contactSecondary) => setProperty({ ...property, contactSecondary })} />
              </div>
              <Field
                label="Features"
                value={property.features.join(', ')}
                onChange={(features) => setProperty({ ...property, features: features.split(',').map((item) => item.trim()).filter(Boolean) })}
                placeholder="Wi-Fi, furnished, secure access"
              />
              <TextAreaField label="Viewing instructions" value={property.viewingInstructions} onChange={(viewingInstructions) => setProperty({ ...property, viewingInstructions })} />
              <ApprovalToggle
                checked={property.descriptiveContentApproved}
                onChange={(descriptiveContentApproved) => setProperty({ ...property, descriptiveContentApproved })}
                label="Approve this descriptive copy for retrieval"
              />
              <button type="submit" disabled={busy} className={buttonClass}>{busy ? 'Saving…' : 'Save property facts'}</button>
            </form>

            <form className="space-y-5 rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm" onSubmit={(event) => { event.preventDefault(); void saveRoom(); }}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-black text-slate-950">Room facts</h2>
                  <p className="mt-1 text-sm text-slate-500">Price and occupancy values stay decision-authoritative.</p>
                </div>
                <button type="button" onClick={() => setRoom(blankRoom(propertyId))} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600">Add room</button>
              </div>
              <label className={labelClass}>
                Existing room
                <select
                  value={room.id}
                  onChange={(event) => setRoom(snapshot.rooms.find((item) => item.id === event.target.value) || blankRoom(propertyId))}
                  className={inputClass}
                >
                  <option value="">New room</option>
                  {snapshot.rooms.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Room label" value={room.label} onChange={(label) => setRoom({ ...room, label })} />
                <Field label="Unit type" value={room.unitType} onChange={(unitType) => setRoom({ ...room, unitType })} />
                <Field label="Rent guidance (R)" type="number" value={room.rentAmount} onChange={(rentAmount) => setRoom({ ...room, rentAmount: Number(rentAmount) })} />
                <Field label="Deposit guidance (R)" type="number" value={room.depositAmount} onChange={(depositAmount) => setRoom({ ...room, depositAmount: Number(depositAmount) })} />
                <Field label="Available from" type="date" value={room.availableFrom} onChange={(availableFrom) => setRoom({ ...room, availableFrom })} />
                <Field label="Maximum occupants" type="number" value={room.maxOccupants} onChange={(maxOccupants) => setRoom({ ...room, maxOccupants: Number(maxOccupants) })} />
                <Field label="Parking" value={room.parking} onChange={(parking) => setRoom({ ...room, parking })} />
                <Field label="Primary contact" value={room.contactPrimary} onChange={(contactPrimary) => setRoom({ ...room, contactPrimary })} />
                <Field label="Secondary contact" value={room.contactSecondary} onChange={(contactSecondary) => setRoom({ ...room, contactSecondary })} />
                <label className={labelClass}>
                  Occupancy
                  <select value={room.occupancy} onChange={(event) => setRoom({ ...room, occupancy: event.target.value === 'vacant' ? 'vacant' : 'occupied' })} className={inputClass}>
                    <option value="occupied">Occupied</option>
                    <option value="vacant">Vacant</option>
                  </select>
                </label>
              </div>
              <div className="flex flex-wrap gap-4 text-sm text-slate-700">
                <label className="flex items-center gap-2"><input type="checkbox" checked={room.isAvailable} onChange={(event) => setRoom({ ...room, isAvailable: event.target.checked })} /> Marked available</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={room.ensuite} onChange={(event) => setRoom({ ...room, ensuite: event.target.checked })} /> Ensuite</label>
              </div>
              <TextAreaField label="Room description" value={room.description} onChange={(description) => setRoom({ ...room, description })} />
              <Field label="Features" value={room.features.join(', ')} onChange={(features) => setRoom({ ...room, features: features.split(',').map((item) => item.trim()).filter(Boolean) })} />
              <TextAreaField label="Deposit terms" value={room.depositTerms} onChange={(depositTerms) => setRoom({ ...room, depositTerms })} />
              <TextAreaField label="Viewing instructions" value={room.viewingInstructions} onChange={(viewingInstructions) => setRoom({ ...room, viewingInstructions })} />
              <ApprovalToggle checked={room.descriptiveContentApproved} onChange={(descriptiveContentApproved) => setRoom({ ...room, descriptiveContentApproved })} label="Approve this room description for retrieval" />
              <button type="submit" disabled={busy} className={buttonClass}>{busy ? 'Saving…' : room.id ? 'Save room facts' : 'Create room'}</button>
            </form>
          </div>
        ) : null}

        {section === 'media' ? (
          <div className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
            <div className="space-y-5 rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
              <div>
                <h2 className="text-lg font-black">Add approved media</h2>
                <p className="mt-1 text-sm leading-6 text-slate-500">Uploads use the existing private <strong>{snapshot.storage.bucket}</strong> bucket. Google Photos and other external http(s) links remain supported during migration.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className={labelClass}>
                  Associate with
                  <select value={mediaUnitId} onChange={(event) => setMediaUnitId(event.target.value)} className={inputClass}>
                    <option value="">Whole property</option>
                    {snapshot.rooms.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                  </select>
                </label>
                <label className={labelClass}>
                  Media kind
                  <select value={mediaKind} onChange={(event) => setMediaKind(event.target.value as PropertyMediaKind)} className={inputClass}>
                    <option value="photo">Photo</option>
                    <option value="floorplan">Floorplan</option>
                    <option value="video">Video</option>
                    <option value="document">Document</option>
                  </select>
                </label>
                <Field label="Display order" type="number" value={mediaOrder} onChange={(value) => setMediaOrder(Number(value))} />
              </div>
              <Field label="Caption" value={mediaCaption} onChange={setMediaCaption} />
              <Field label="Alt text" value={mediaAltText} onChange={setMediaAltText} placeholder="Describe what the customer can see" />
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <input type="checkbox" checked={mediaApproved} onChange={(event) => setMediaApproved(event.target.checked)} />
                Approve for customer-facing use
              </label>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <label className={labelClass}>
                  Private upload
                  <input type="file" accept="image/*,video/*,application/pdf" onChange={(event) => setMediaFile(event.target.files?.[0] || null)} className="mt-2 block w-full text-sm" />
                </label>
                <button type="button" disabled={busy || !mediaFile} onClick={() => void uploadMedia()} className={`${buttonClass} mt-4`}>Upload media</button>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <Field label="External / Google Photos URL" type="url" value={externalUrl} onChange={setExternalUrl} />
                <button type="button" disabled={busy || !externalUrl.trim()} onClick={() => void saveExternalMedia()} className={`${buttonClass} mt-4`}>Save external link</button>
              </div>
            </div>

            <div className="space-y-3 rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-black">Media library</h2>
                <span className="text-xs text-slate-500">{snapshot.media.length} items</span>
              </div>
              {snapshot.media.length ? snapshot.media.map((item) => (
                <article key={item.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap gap-2 text-xs font-bold uppercase tracking-wide">
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">{item.kind}</span>
                        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-blue-700">{item.sourceKind}</span>
                        <span className={`rounded-full px-2.5 py-1 ${item.isApproved ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{item.isApproved ? 'Approved' : 'Draft'}</span>
                      </div>
                      <h3 className="mt-3 font-bold text-slate-900">{item.caption || item.altText || 'Untitled media'}</h3>
                      <p className="mt-1 break-all text-xs text-slate-500">{item.sourceKind === 'external' ? item.externalUrl : item.storagePath}</p>
                      <p className="mt-1 text-xs text-slate-500">Association: {snapshot.rooms.find((roomItem) => roomItem.id === item.unitId)?.label || 'Whole property'} · Order {item.displayOrder}</p>
                    </div>
                    <button type="button" disabled={busy} onClick={() => void setApproval(item, !item.isApproved)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700">
                      {item.isApproved ? 'Remove approval' : 'Approve'}
                    </button>
                  </div>
                  {(item.deliveryUrl || item.externalUrl) ? (
                    <a href={item.deliveryUrl || item.externalUrl} target="_blank" rel="noreferrer" className="mt-3 inline-block text-sm font-semibold text-blue-700 hover:underline">Open media</a>
                  ) : null}
                </article>
              )) : <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No media is associated with this property yet.</p>}
            </div>
          </div>
        ) : null}

        {section === 'import' ? (
          <div className="space-y-5 rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm" data-testid="property-import">
            <div>
              <h2 className="text-lg font-black">Reviewed structured import</h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
                The mapping assistant suggests known fields with confidence and reasons. Preview and validation are read-only; Apply stays disabled until every row is valid.
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <label className={`${labelClass} min-w-[260px] flex-1`}>
                CSV, JSON, XLS, or XLSX file
                <input
                  type="file"
                  accept=".csv,.json,.xls,.xlsx"
                  onChange={(event: ChangeEvent<HTMLInputElement>) => {
                    setImportFile(event.target.files?.[0] || null);
                    setImportPreview(null);
                    setMapping({});
                  }}
                  className="mt-2 block w-full text-sm"
                />
              </label>
              <button type="button" disabled={busy || !importFile} onClick={() => void previewImport()} className={buttonClass}>{busy ? 'Checking…' : 'Preview mapping'}</button>
            </div>

            {importPreview ? (
              <>
                <div className="overflow-x-auto rounded-2xl border border-slate-200">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-500">
                      <tr><th className="px-4 py-3">Source column</th><th className="px-4 py-3">Suggested field</th><th className="px-4 py-3">Confidence</th><th className="px-4 py-3">Reason</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {importPreview.preview.suggestions.map((suggestion) => (
                        <tr key={suggestion.sourceHeader}>
                          <td className="px-4 py-3 font-semibold">{suggestion.sourceHeader}</td>
                          <td className="px-4 py-3">
                            <select
                              aria-label={`Map ${suggestion.sourceHeader}`}
                              value={mapping[suggestion.sourceHeader] || 'ignore'}
                              onChange={(event) => {
                                const next = { ...mapping, [suggestion.sourceHeader]: event.target.value as PropertyImportField };
                                void refreshPreview(next);
                              }}
                              className="rounded-lg border border-slate-200 bg-white px-2 py-1.5"
                            >
                              {importFields.map((field) => <option key={field} value={field}>{field}</option>)}
                            </select>
                          </td>
                          <td className="px-4 py-3">{Math.round(suggestion.confidence * 100)}%</td>
                          <td className="max-w-md px-4 py-3 text-xs leading-5 text-slate-500">{suggestion.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="overflow-x-auto rounded-2xl border border-slate-200">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-500">
                      <tr><th className="px-4 py-3">Row</th><th className="px-4 py-3">Scope</th><th className="px-4 py-3">Room</th><th className="px-4 py-3">Description</th><th className="px-4 py-3">Validation</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {importPreview.preview.rows.slice(0, 25).map((item) => (
                        <tr key={item.rowNumber}>
                          <td className="px-4 py-3">{item.rowNumber}</td>
                          <td className="px-4 py-3">{String(item.values.scope)}</td>
                          <td className="px-4 py-3">{String(item.values.roomLabel || '—')}</td>
                          <td className="max-w-xs truncate px-4 py-3">{String(item.values.description || '—')}</td>
                          <td className="px-4 py-3 text-xs">
                            {item.errors.length ? <span className="text-rose-700">{item.errors.join(' ')}</span> : item.warnings.length ? <span className="text-amber-700">{item.warnings.join(' ')}</span> : <span className="text-emerald-700">Valid</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {importPreview.preview.errors.length ? (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{importPreview.preview.errors.join(' ')}</div>
                ) : (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                    {importPreview.preview.rows.length} rows validated. Nothing has been saved yet.
                  </div>
                )}
                <button
                  type="button"
                  disabled={busy || !importPreview.preview.canApply}
                  onClick={() => void applyImport()}
                  className={buttonClass}
                  data-testid="apply-property-import"
                >
                  Review complete — apply import
                </button>
              </>
            ) : null}

            {snapshot.imports.length ? (
              <div>
                <h3 className="text-sm font-black uppercase tracking-wide text-slate-600">Recent reviewed imports</h3>
                <div className="mt-3 grid gap-2">
                  {snapshot.imports.map((item) => (
                    <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3 text-sm">
                      <span><strong>{item.sourceFileName}</strong> · {item.sourceFormat.toUpperCase()}</span>
                      <span className="text-xs text-slate-500">{item.status} · {new Date(item.createdAt).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
