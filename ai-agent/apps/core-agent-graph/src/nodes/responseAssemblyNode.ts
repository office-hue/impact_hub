import path from 'node:path';
import type { CoreAgentState } from '../state.js';

export async function responseAssemblyNode(state: CoreAgentState): Promise<Partial<CoreAgentState>> {
  const logs = [...(state.logs ?? [])];
  const routingEnabled = process.env.CORE_CAPABILITY_ROUTING === '1';
  const artifactsMode = process.env.ARTIFACTS_MODE || 'dual'; // dual | legacy | artifacts
  const includeArtifacts = artifactsMode !== 'legacy';
  const includeLegacy = artifactsMode !== 'artifacts';

  if (!routingEnabled) {
    logs.push('responseAssembly: routing disabled');
    return { logs };
  }

  if (!state.capabilityOutput) {
    logs.push('responseAssembly: skip (nincs capabilityOutput)');
    return { logs };
  }

  logs.push('responseAssembly: capabilityOutput elérhető (stub response)');

  const output = state.capabilityOutput as any;

  // Ha explicit státusz skip/hiba, ne írjuk felül a meglévő választ – csak logoljuk.
  if (output?.status && output.status !== 'ok') {
    const friendly =
      output.status === 'skipped' && output.reason === 'no_structured_documents'
        ? 'Nincs feltöltött táblázat a merge-hez. Adj meg egy Excel/CSV fájlt vagy küldd újra a kérést dokumentummal.'
        : output.status === 'error'
        ? `Hiba történt: ${output.reason || 'ismeretlen ok'}`
        : output.status !== 'ok'
        ? `Capability status: ${output.status}${output.reason ? ` (${output.reason})` : ''}`
        : null;
    if (friendly && !state.finalResponse) {
      return { logs, finalResponse: friendly };
    }
    if (friendly) {
      logs.push(`responseAssembly: capability status = ${output.status}, finalResponse nem módosul`);
    }
    return { logs, finalResponse: state.finalResponse };
  }

  if (output?.kind === 'ads' && typeof output.summary === 'string') {
    return { logs, finalResponse: state.finalResponse ?? output.summary };
  }

  let responseText: string | undefined;

  if (Array.isArray(output?.outputFiles) && output.outputFiles.length) {
    const files = output.outputFiles.map((file: string) => ({
      path: file,
      name: path.basename(file),
      ext: path.extname(file).toLowerCase(),
    }));
    const mimeByExt: Record<string, string> = {
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.csv': 'text/csv',
      '.json': 'application/json',
      '.pdf': 'application/pdf',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };
    const maxFiles = 3;
    const listed = files.slice(0, maxFiles).map((file: { name: string }) => file.name);
    const extra = files.length > maxFiles ? ` (+${files.length - maxFiles} további)` : '';
    responseText = `Táblázatok összefésülve. Kimeneti fájlok: ${listed.join(', ')}${extra}`;
    const artifacts = includeArtifacts
      ? files.map((file: { name: string; path: string; ext: string }) => ({
          type: 'file' as const,
          filename: file.name,
          downloadUrl: `/core/merge-download?file=${encodeURIComponent(file.path)}`,
          mimeType: mimeByExt[file.ext],
          metadata: {
            source: 'merge-tables',
            path: file.path,
          },
        }))
      : [];
    return {
      logs,
      finalResponse: state.finalResponse ?? responseText,
      artifacts: includeArtifacts ? artifacts : undefined,
    };
  }

  if (output?.summary && Array.isArray(output.offers)) {
    const maxOffers = 3;
    const offers = output.offers.slice(0, maxOffers).map((offer: any, idx: number) => {
      const shop =
        offer.shop_name || offer.shop_slug || offer.slug || offer.title || offer.cta_label || `offer-${idx + 1}`;
      const donation =
        typeof offer.donation_rate === 'number'
          ? ` • adomány: ${(offer.donation_rate * 100).toFixed(1)}%`
          : offer.donation_mode_label
          ? ` • ${offer.donation_mode_label}`
          : '';
      const estimatedDonation =
        typeof offer.donation_per_1000_huf === 'number' && offer.donation_per_1000_huf > 0
          ? ` • ~${offer.donation_per_1000_huf} Ft / 1 000 Ft`
          : '';
      const cta = offer.cta_url ? ` • ${offer.cta_url}` : '';
      return `#${idx + 1}: ${shop}${donation}${estimatedDonation}${cta}`;
    });
    const extra = output.offers.length > maxOffers ? `\n(+${output.offers.length - maxOffers} további ajánlat)` : '';
    const summary = output.summary.length > 300 ? `${output.summary.slice(0, 300)}…` : output.summary;
    responseText = `${summary}${offers.length ? `\n${offers.join('\n')}` : ''}${extra}`;
    const artifacts =
      includeArtifacts && output.offers
        ? output.offers.map((offer: any) => ({
            type: 'link' as const,
            url: offer.cta_url,
            label: offer.shop_name || offer.shop_slug || offer.title,
            metadata: {
              cta_label: offer.cta_label,
              donation_rate: offer.donation_rate,
              donation_per_1000_huf: offer.donation_per_1000_huf,
              donation_mode_label: offer.donation_mode_label,
              discount_value: offer.discount_value,
              discount_type: offer.discount_type,
              shop_category: offer.shop_category,
              shop_slug: offer.shop_slug,
              slug: offer.slug,
              validity_start: offer.validity_start,
              validity_end: offer.validity_end,
            },
          }))
        : [];

    const legacyRecommendations =
      includeLegacy && output.offers && output.offers.length
        ? {
            persona: output.persona ?? 'Impi',
            summary: output.summary ?? '',
            offers: output.offers,
            query: output.query ?? state.userMessage ?? '',
            preferred_ngo_slug: output.preferred_ngo_slug ?? null,
            intent: output.intent ?? null,
            intent_confidence: output.intent_confidence ?? null,
            intent_matched_keywords: output.intent_matched_keywords ?? [],
            category_id: output.category_id ?? null,
            warnings: output.warnings ?? [],
            cleanup_candidates: output.cleanup_candidates ?? [],
            context_metadata: output.context_metadata ?? null,
            performance: output.performance ?? null,
          }
        : undefined;
    const legacyContext = includeLegacy
      ? output.context_metadata ?? output.contextMetadata ?? output.contextMeta ?? null
      : undefined;

    return {
      logs,
      finalResponse: state.finalResponse ?? responseText,
      artifacts: includeArtifacts ? artifacts : undefined,
      recommendations: legacyRecommendations ?? (includeLegacy ? null : undefined),
      contextMetadata: legacyContext ?? (includeLegacy ? null : undefined),
    };
  } else if (typeof output === 'string') {
    responseText = output;
  } else {
    responseText = JSON.stringify(output);
  }

  return { logs, finalResponse: state.finalResponse ?? responseText };
}
