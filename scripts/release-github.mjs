/** All draft operations use IDs: GitHub permits multiple drafts with the same tag. */
export async function prepareDraft({ api, releases, tag, sha, title, body }) {
  const matches = releases.filter(item => item.tag_name === tag);
  if (matches.some(item => !item.draft)) throw new Error(`${tag} 已发布，不能覆盖`);
  const draft = matches.find(item => item.target_commitish === sha) ?? matches[0];
  const fields = { tag_name: tag, target_commitish: sha, name: title, body, draft: true };
  return api(draft ? `releases/${draft.id}` : 'releases', draft ? 'PATCH' : 'POST', fields);
}

export async function uploadDraftAssets({ api, upload, draft, files, digest }) {
  for (const file of files) {
    const existing = (await api(`releases/${draft.id}`)).assets.find(asset => asset.name === file.name);
    if (existing) await api(`releases/assets/${existing.id}`, 'DELETE');
    await upload(`${draft.upload_url.replace(/\{.*$/, '')}?name=${encodeURIComponent(file.name)}`, file.path);
  }
  const verified = await api(`releases/${draft.id}`);
  for (const file of files) {
    const asset = verified.assets.find(item => item.name === file.name);
    if (!asset || asset.size !== file.size || asset.state !== 'uploaded') throw new Error(`${file.name} 上传不完整`);
    if (!asset.digest || asset.digest !== `sha256:${await digest(file.path)}`) throw new Error(`${file.name} 上传摘要与本地不一致`);
  }
  return verified;
}
