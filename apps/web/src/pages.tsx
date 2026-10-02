import {
  AlertCircle, ArrowDownLeft, ArrowUpRight, BadgeCheck, Building2, CalendarRange, Check,
  ChevronRight, CircleDollarSign, Download, FileCheck2, FileUp, ListFilter,
  LoaderCircle, LockKeyhole, Paperclip, Plus, RefreshCw, Search, ShieldCheck, UploadCloud, WalletCards, X,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, cents, dateBr, field, money, submit, useApiData, useAuth, useFormAction, type Row } from "./lib";

const today = new Date().toISOString().slice(0, 10);
const currentPeriod = today.slice(0, 7);

function PageTitle({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="page-title"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{action}</div>;
}
function Card({ title, subtitle, children, className = "" }: { title?: string; subtitle?: string; children: ReactNode; className?: string }) {
  return <section className={`card ${className}`}>{title && <div className="card-head"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div></div>}<div className="card-body">{children}</div></section>;
}
function State({ loading, error, empty, children }: { loading: boolean; error: string; empty?: boolean; children: ReactNode }) {
  if (loading) return <div className="state"><LoaderCircle className="spin" /> Carregando…</div>;
  if (error) return <div className="notice error"><AlertCircle />{error}</div>;
  if (empty) return <div className="state">Nenhum registro encontrado.</div>;
  return <>{children}</>;
}
function Feedback({ message }: { message: string }) { return message ? <div className={`form-message ${message.includes("sucesso") ? "success" : ""}`}>{message}</div> : null; }
function Dialog({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  return <div className="dialog-layer"><button className="dialog-backdrop" onClick={onClose} aria-label="Fechar" /><div className={`dialog ${wide ? "wide" : ""}`} role="dialog"><div className="dialog-head"><h2>{title}</h2><button className="icon-button" onClick={onClose}><X /></button></div>{children}</div></div>;
}
function Status({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "good" | "warn" | "bad" }) { return <span className={`status ${tone}`}>{children}</span>; }

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const action = useFormAction();
  return <div className="login-page">
    <div className="login-visual">
      <div className="login-brand"><span className="brand-mark">B</span><span><strong>Blexo</strong><small>Auditor Financeiro</small></span></div>
      <div className="login-copy"><span className="eyebrow light">CONTROLE COM TRANSPARÊNCIA</span><h1>Finanças auditáveis.<br />Decisões tranquilas.</h1><p>Importe extratos CNAB 240, classifique movimentações e gere balancetes com rastreabilidade de ponta a ponta.</p></div>
      <div className="login-points"><span><BadgeCheck /> Integridade dos dados</span><span><ShieldCheck /> Isolamento por condomínio</span><span><FileCheck2 /> Trilha de auditoria</span></div>
    </div>
    <div className="login-panel"><div className="login-box"><span className="mobile-brand"><span className="brand-mark">B</span>Blexo</span><h2>Bem-vindo de volta</h2><p>Acesse o ambiente financeiro do seu condomínio.</p>
      <form onSubmit={submit(async (form) => {
        const ok = await action.run(() => login(field(form, "email"), field(form, "password")));
        if (ok) navigate("/");
      })}>
        <label>E-mail<input name="email" type="email" placeholder="nome@condominio.com.br" autoComplete="email" required /></label>
        <label>Senha<input name="password" type="password" placeholder="Sua senha" autoComplete="current-password" minLength={8} required /></label>
        <Feedback message={action.message} />
        <button className="button primary block" disabled={action.busy}>{action.busy ? <LoaderCircle className="spin" /> : <LockKeyhole />}Entrar com segurança</button>
      </form><small className="security-note"><ShieldCheck /> Sua sessão é protegida e os dados são segregados por condomínio.</small>
    </div></div>
  </div>;
}

export function DashboardPage() {
  const [period, setPeriod] = useState(currentPeriod);
  const { data, loading, error, reload } = useApiData<{ summary?: Row; accounts: Row[]; recent: Row[]; budget?: Row }>(`/reports/dashboard?period=${period}`, { accounts: [], recent: [] });
  const summary = data.summary ?? {};
  const credits = Number(summary.credits_cents ?? 0); const debits = Number(summary.debits_cents ?? 0);
  const activeCount = Number(summary.active_count ?? 0); const pendingCount = Number(summary.unclassified_count ?? 0);
  const conciliation = activeCount ? Math.round(((activeCount - pendingCount) / activeCount) * 100) : 100;
  return <>
    <PageTitle eyebrow="PAINEL FINANCEIRO" title="Visão geral" description="Um retrato claro da movimentação e das pendências do período." action={<div className="toolbar"><input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} /><button className="button ghost" onClick={() => void reload()}><RefreshCw />Atualizar</button></div>} />
    <State loading={loading} error={error}><>
      <div className="metrics">
        <div className="metric accent"><span className="metric-icon"><CircleDollarSign /></span><small>Saldo do período</small><strong>{money(credits - debits)}</strong><em>Créditos menos débitos</em></div>
        <div className="metric"><span className="metric-icon green"><ArrowUpRight /></span><small>Entradas</small><strong>{money(credits)}</strong><em>Na data contábil</em></div>
        <div className="metric"><span className="metric-icon red"><ArrowDownLeft /></span><small>Saídas</small><strong>{money(debits)}</strong><em>Na data contábil</em></div>
        <div className="metric"><span className="metric-icon amber"><ListFilter /></span><small>A classificar</small><strong>{String(summary.unclassified_count ?? 0)}</strong><em>{money(summary.unclassified_value_cents)} pendentes</em></div>
        <div className="metric"><span className="metric-icon purple"><CalendarRange /></span><small>Orçamento do mês</small><strong>{money(data.budget?.planned_cents)}</strong><em>{money(data.budget?.actual_cents)} realizado</em></div>
        <div className="metric"><span className="metric-icon green"><WalletCards /></span><small>Saldo dos fundos</small><strong>{money(data.budget?.fund_balance_cents)}</strong><em>Fundos ativos</em></div>
      </div>
      <div className="dashboard-grid">
        <Card title="Contas bancárias" subtitle="Saldo calculado pelo sistema, sem confiar no saldo do arquivo.">
          <div className="account-list">{data.accounts.length ? data.accounts.map((row) => <div className="account-row" key={String(row.id)}><span className="bank-avatar">{bankName(row.bank_code).slice(0, 1)}</span><div><strong>{String(row.description)}</strong><small>{bankName(row.bank_code)} · último movimento {dateBr(row.last_movement_date)}</small></div><b>{money(row.balance_cents)}</b></div>) : <div className="state compact">Cadastre a primeira conta bancária.</div>}</div>
        </Card>
        <Card title="Saúde do período" subtitle="Pontos que merecem sua atenção antes do fechamento.">
          <div className="health-ring"><div style={{ "--score": `${conciliation}%` } as React.CSSProperties}><strong>{conciliation}%</strong><small>conciliado</small></div></div>
          <div className="health-items"><span><i className="dot amber" />{String(summary.unclassified_count ?? 0)} movimentações sem classificação</span><span><i className="dot red" />{String(summary.without_evidence_count ?? 0)} sem comprovante válido</span><span><i className="dot green" />Base contábil pela data contábil</span></div>
        </Card>
      </div>
      <Card title="Movimentações recentes" subtitle="Últimos registros financeiros do condomínio.">
        <div className="table-wrap"><table><thead><tr><th>Número</th><th>Data</th><th>Descrição</th><th>Origem</th><th className="right">Valor</th></tr></thead><tbody>{data.recent.map((row) => <tr key={String(row.public_number)}><td><b>{String(row.public_number)}</b></td><td>{dateBr(row.accounting_date)}</td><td>{String(row.description)}</td><td><Status>{row.source_type === "BANK" ? "Banco" : "Manual"}</Status></td><td className={`right amount ${row.direction === "CREDIT" ? "positive" : "negative"}`}>{row.direction === "CREDIT" ? "+" : "−"}{money(row.amount_cents)}</td></tr>)}</tbody></table></div>
      </Card>
    </></State>
  </>;
}

export function MovementsPage() {
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState(false);
  const { data, loading, error, reload } = useApiData<{ items: Row[] }>(`/movements?limit=100${query ? `&description=${encodeURIComponent(query)}` : ""}`, { items: [] });
  const accounts = useApiData<{ items: Row[] }>("/bank-accounts", { items: [] });
  const action = useFormAction(async () => { setDialog(false); await reload(); });
  return <>
    <PageTitle eyebrow="LIVRO FINANCEIRO" title="Movimentações" description="Extratos importados e ajustes manuais no mesmo livro, com numeração única." action={<button className="button primary" onClick={() => setDialog(true)}><Plus />Novo lançamento</button>} />
    <div className="filterbar"><div className="search"><Search /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar pela descrição…" /></div><Status tone="warn">{data.items.filter((row) => row.classification_status === "UNCLASSIFIED").length} a classificar</Status></div>
    <Card><State loading={loading} error={error} empty={!data.items.length}><div className="table-wrap"><table><thead><tr><th>Número</th><th>Data contábil</th><th>Descrição</th><th>Conta</th><th>Classificação</th><th className="right">Valor</th><th /></tr></thead><tbody>{data.items.map((row) => <tr key={String(row.id)}><td><b>{String(row.public_number)}</b><small className="cell-note">{row.source_type === "BANK" ? "CNAB" : "Manual"}</small></td><td>{dateBr(row.accounting_date)}</td><td>{String(row.description)}</td><td>{String(row.bank_account_description)}</td><td><Status tone={row.classification_status === "CLASSIFIED" ? "good" : "warn"}>{classificationLabel(row.classification_status)}</Status></td><td className={`right amount ${row.direction === "CREDIT" ? "positive" : "negative"}`}>{row.direction === "CREDIT" ? "+" : "−"}{money(row.amount_cents)}</td><td><Link className="row-link" to={`/movimentos/${String(row.id)}`}><ChevronRight /></Link></td></tr>)}</tbody></table></div></State></Card>
    {dialog && <Dialog title="Novo lançamento manual" onClose={() => setDialog(false)}><form className="form-grid" onSubmit={submit(async (form) => {
      await action.run(() => api("/movements", { method: "POST", body: JSON.stringify({ bankAccountId: field(form, "account"), accountingDate: field(form, "date"), competenceDate: field(form, "competence"), direction: field(form, "direction"), amountCents: cents(field(form, "amount")), description: field(form, "description"), justification: field(form, "justification") }) }));
    })}>
      <label className="span-2">Conta bancária<select name="account" required><option value="">Selecione</option>{accounts.data.items.map((row) => <option value={String(row.id)} key={String(row.id)}>{String(row.description)}</option>)}</select></label>
      <label>Data contábil<input name="date" type="date" defaultValue={today} required /></label><label>Competência<input name="competence" type="date" defaultValue={today} required /></label>
      <label>Natureza<select name="direction"><option value="DEBIT">Débito / saída</option><option value="CREDIT">Crédito / entrada</option></select></label><label>Valor<input name="amount" inputMode="decimal" placeholder="0,00" required /></label>
      <label className="span-2">Descrição<input name="description" required minLength={2} /></label><label className="span-2">Justificativa<textarea name="justification" required minLength={3} /></label>
      <Feedback message={action.message} /><div className="dialog-actions span-2"><button type="button" className="button ghost" onClick={() => setDialog(false)}>Cancelar</button><button className="button primary" disabled={action.busy}>Salvar lançamento</button></div>
    </form></Dialog>}
  </>;
}

export function MovementDetailPage() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: movement, loading, error, reload } = useApiData<Row>(`/movements/${id}`, {});
  const chart = useApiData<{ items: Row[] }>("/chart-accounts", { items: [] });
  const [allocationOpen, setAllocationOpen] = useState(false);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const action = useFormAction(async () => { setAllocationOpen(false); setEvidenceOpen(false); await reload(); });
  const allocations = (movement.allocations as Row[] | undefined) ?? [];
  const evidences = (movement.evidences as Row[] | undefined) ?? [];
  return <>
    <div className="breadcrumb"><Link to="/movimentos">Movimentações</Link><ChevronRight />{String(movement.public_number ?? "Detalhe")}</div>
    <PageTitle eyebrow="DETALHE DO MOVIMENTO" title={String(movement.public_number ?? "Movimentação")} description="Rastreabilidade financeira, classificação contábil e documentação comprobatória." action={<Status tone={movement.status === "ACTIVE" ? "good" : "bad"}>{movement.status === "ACTIVE" ? "Ativo" : "Cancelado"}</Status>} />
    <State loading={loading} error={error}><>
      <div className="detail-hero"><div><small>Descrição</small><h2>{String(movement.description)}</h2><span>{dateBr(movement.accounting_date)} · {String(movement.bank_account_description)}</span></div><strong className={movement.direction === "CREDIT" ? "positive" : "negative"}>{movement.direction === "CREDIT" ? "+" : "−"}{money(movement.amount_cents)}</strong></div>
      <div className="detail-grid">
        <Card title="Dados do lançamento"><dl className="data-list"><div><dt>Origem</dt><dd>{movement.source_type === "BANK" ? "Extrato bancário CNAB" : "Lançamento manual"}</dd></div><div><dt>Data contábil</dt><dd>{dateBr(movement.accounting_date)}</dd></div><div><dt>Competência</dt><dd>{dateBr(movement.competence_date)}</dd></div><div><dt>Fornecedor</dt><dd>{String(movement.supplier_name ?? "Não informado")}</dd></div><div className="full"><dt>Justificativa</dt><dd>{String(movement.justification ?? "Não informada")}</dd></div></dl></Card>
        <Card title="Origem bancária"><dl className="data-list"><div><dt>Código de histórico</dt><dd>{String(movement.history_code ?? "—")}</dd></div><div><dt>Documento</dt><dd>{String(movement.document_number ?? "—")}</dd></div><div><dt>Data do evento</dt><dd>{dateBr(movement.source_event_date)}</dd></div><div><dt>Identificador interno</dt><dd className="mono">{String(movement.id).slice(0, 18)}…</dd></div></dl></Card>
      </div>
      <Card title="Rateio contábil" subtitle="O número do movimento permanece único, mesmo quando distribuído entre várias contas." className="section-gap">
        <div className="card-action"><button className="button ghost" onClick={() => setAllocationOpen(true)} disabled={user?.role === "VIEWER"}><Plus />Definir rateio</button></div>
        {allocations.length ? <div className="table-wrap"><table><thead><tr><th>Linha</th><th>Conta contábil</th><th>Tipo</th><th className="right">Valor</th></tr></thead><tbody>{allocations.map((row) => <tr key={String(row.id)}><td>{String(row.line_number)}</td><td>{String(row.chart_account_code ?? "—")} · {String(row.chart_account_name ?? "Sem conta")}</td><td>{classificationLabel(row.classification_type)}</td><td className="right"><b>{money(row.amount_cents)}</b></td></tr>)}</tbody></table></div> : <div className="empty-action"><ListFilter /><div><strong>Ainda não classificado</strong><p>Defina a conta contábil para preparar o balancete.</p></div></div>}
      </Card>
      <Card title="Comprovantes" subtitle="Documentos PDF, JPG ou PNG vinculados diretamente ao movimento." className="section-gap">
        <div className="card-action"><button className="button ghost" onClick={() => setEvidenceOpen(true)} disabled={user?.role === "VIEWER"}><Paperclip />Anexar arquivo</button></div>
        {evidences.length ? <div className="evidence-list">{evidences.map((row) => <a href={`/api/evidences/${String(row.id)}/download`} target="_blank" rel="noreferrer" key={String(row.id)}><span><FileCheck2 /></span><div><strong>{String(row.original_filename)}</strong><small>{String(row.evidence_type)} · {(Number(row.size_bytes) / 1024).toFixed(0)} KB</small></div><Download /></a>)}</div> : <div className="empty-action"><Paperclip /><div><strong>Nenhum comprovante</strong><p>Anexe a documentação que justifica este movimento.</p></div></div>}
      </Card>
      {movement.source_type === "MANUAL" && user?.role === "ADMIN" && movement.status === "ACTIVE" && <div className="danger-zone"><div><strong>Cancelar lançamento manual</strong><p>O registro permanecerá na auditoria e deixará de sensibilizar os saldos.</p></div><button className="button danger" onClick={() => { const reason = window.prompt("Informe o motivo do cancelamento:"); if (reason) void action.run(async () => { await api(`/movements/${id}/cancel`, { method: "POST", body: JSON.stringify({ reason, expectedVersion: movement.version }) }); navigate("/movimentos"); }); }}>Cancelar lançamento</button></div>}
    </></State>
    {allocationOpen && <Dialog title="Classificar movimento" onClose={() => setAllocationOpen(false)}><form className="form-grid" onSubmit={submit(async (form) => {
      await action.run(() => api(`/movements/${id}/allocations`, { method: "PUT", body: JSON.stringify({ mode: "AMOUNT", expectedVersion: Number(movement.version), items: [{ chartAccountId: field(form, "account"), classificationType: field(form, "type"), amountCents: Number(movement.amount_cents), description: field(form, "description") || undefined }] }) }));
    })}><label className="span-2">Conta contábil<select name="account" required><option value="">Selecione</option>{chart.data.items.filter((row) => row.status === "ACTIVE").map((row) => <option key={String(row.id)} value={String(row.id)}>{String(row.code)} · {String(row.name)}</option>)}</select></label><label className="span-2">Classificação<select name="type"><option value={movement.direction === "CREDIT" ? "INCOME" : "EXPENSE"}>{movement.direction === "CREDIT" ? "Receita" : "Despesa"}</option><option value="TRANSFER">Transferência</option><option value="ADJUSTMENT">Ajuste</option><option value="FUND">Fundo</option></select></label><label className="span-2">Descrição do rateio<input name="description" /></label><Feedback message={action.message} /><div className="dialog-actions span-2"><button type="button" className="button ghost" onClick={() => setAllocationOpen(false)}>Cancelar</button><button className="button primary" disabled={action.busy}>Salvar classificação</button></div></form></Dialog>}
    {evidenceOpen && <Dialog title="Anexar comprovante" onClose={() => setEvidenceOpen(false)}><form className="form-grid" onSubmit={submit(async (form) => {
      const body = new FormData(form); body.set("movementId", id); body.set("includeInReport", "true");
      await action.run(() => api("/evidences", { method: "POST", body }));
    })}><label className="span-2 file-drop"><UploadCloud /><strong>Selecione um PDF, JPG ou PNG</strong><small>Máximo de 20 MB</small><input name="file" type="file" accept="application/pdf,image/jpeg,image/png" required /></label><label className="span-2">Tipo<select name="evidenceType"><option value="INVOICE">Nota fiscal</option><option value="RECEIPT">Recibo</option><option value="PAYMENT_PROOF">Comprovante de pagamento</option><option value="CONTRACT">Contrato</option><option value="DOCUMENT">Documento</option><option value="OTHER">Outro</option></select></label><label className="span-2">Descrição<input name="description" /></label><Feedback message={action.message} /><div className="dialog-actions span-2"><button type="button" className="button ghost" onClick={() => setEvidenceOpen(false)}>Cancelar</button><button className="button primary" disabled={action.busy}>Enviar comprovante</button></div></form></Dialog>}
  </>;
}

export function ImportsPage() {
  const [uploadOpen, setUploadOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const { data, loading, error, reload } = useApiData<{ items: Row[] }>("/imports", { items: [] });
  const preview = useApiData<Row & { items: Row[] }>(selected ? `/imports/${selected}/preview` : null, { items: [] });
  const action = useFormAction(async () => { setUploadOpen(false); await reload(); if (selected) await preview.reload(); });
  return <>
    <PageTitle eyebrow="INTEGRAÇÃO BANCÁRIA" title="Importações CNAB 240" description="Extratos Itaú e Sicredi entram em uma prévia segura antes de afetar os saldos." action={<button className="button primary" onClick={() => setUploadOpen(true)}><FileUp />Importar arquivo</button>} />
    <div className="callout"><ShieldCheck /><div><strong>O saldo informado pelo banco não é utilizado.</strong><p>A auditoria calcula os saldos exclusivamente pelos movimentos importados e lançamentos manuais.</p></div></div>
    <Card><State loading={loading} error={error} empty={!data.items.length}><div className="table-wrap"><table><thead><tr><th>Arquivo</th><th>Banco</th><th>Data</th><th>Registros</th><th>Novos</th><th>Duplicados</th><th>Status</th><th /></tr></thead><tbody>{data.items.map((row) => <tr key={String(row.id)}><td><b>{String(row.original_filename)}</b></td><td>{bankName(row.bank_code)}</td><td>{dateBr(row.created_at)}</td><td>{String(row.record_count)}</td><td>{String(row.new_count)}</td><td>{String(row.duplicate_count)}</td><td><Status tone={row.status === "COMPLETED" ? "good" : row.status === "FAILED" ? "bad" : "warn"}>{importLabel(row.status)}</Status></td><td><button className="row-link" onClick={() => setSelected(String(row.id))}><ChevronRight /></button></td></tr>)}</tbody></table></div></State></Card>
    {uploadOpen && <Dialog title="Importar extrato CNAB 240" onClose={() => setUploadOpen(false)}><form className="form-grid" onSubmit={submit(async (form) => { const body = new FormData(form); await action.run(() => api("/imports", { method: "POST", body })); })}><label className="span-2 file-drop"><UploadCloud /><strong>Escolha o arquivo CNAB 240</strong><small>Arquivo texto do Itaú (341) ou Sicredi (748), até 10 MB</small><input name="file" type="file" accept=".txt,.ret,.cnab,text/plain" required /></label><div className="notice span-2"><AlertCircle />A conta é identificada pelo banco, agência e número registrados no arquivo.</div><Feedback message={action.message} /><div className="dialog-actions span-2"><button type="button" className="button ghost" onClick={() => setUploadOpen(false)}>Cancelar</button><button className="button primary" disabled={action.busy}>Analisar arquivo</button></div></form></Dialog>}
    {selected && <ImportPreviewDialog importId={selected} preview={preview} busy={action.busy} message={action.message} onClose={() => setSelected(null)} onRun={action.run} />}
  </>;
}

function ImportPreviewDialog({ importId, preview, busy, message, onClose, onRun }: {
  importId: string;
  preview: ReturnType<typeof useApiData<Row & { items: Row[] }>>;
  busy: boolean;
  message: string;
  onClose: () => void;
  onRun: (action: () => Promise<unknown>) => Promise<boolean>;
}) {
  const issues = (preview.data.issues as Row[] | undefined) ?? [];
  const unresolved = preview.data.items.filter((row) => row.status === "POSSIBLE_DUPLICATE");
  const decide = (itemId: string, decision: "IMPORT" | "SKIP_DUPLICATE") => onRun(() => api(`/imports/${importId}/decisions`, {
    method: "POST", body: JSON.stringify({ decisions: [{ itemId, action: decision }] }),
  }));
  return <Dialog title="Prévia da importação" wide onClose={onClose}>
    <div className="preview-summary"><div><small>Arquivo</small><strong>{String(preview.data.original_filename ?? "")}</strong></div><div><small>Débitos</small><strong>{money(preview.data.debit_total_cents)}</strong></div><div><small>Créditos</small><strong>{money(preview.data.credit_total_cents)}</strong></div></div>
    {issues.length > 0 && <div className="notice"><AlertCircle /><div>{issues.map((issue, index) => <p key={index}>{String(issue.message)}</p>)}</div></div>}
    <State loading={preview.loading} error={preview.error}><div className="table-wrap preview-table"><table><thead><tr><th>Linha</th><th>Data</th><th>Descrição</th><th>Situação / decisão</th><th className="right">Valor</th></tr></thead><tbody>{preview.data.items.map((row) => <tr key={String(row.id)}><td>{String(row.source_line_number)}</td><td>{dateBr(row.accounting_date)}</td><td>{String(row.description)}</td><td>{row.status === "POSSIBLE_DUPLICATE" ? <div className="decision-buttons"><button className="button small ghost" disabled={busy} onClick={() => void decide(String(row.id), "IMPORT")}>Importar mesmo assim</button><button className="button small ghost" disabled={busy} onClick={() => void decide(String(row.id), "SKIP_DUPLICATE")}>Ignorar repetido</button></div> : <Status tone={row.status === "READY" || row.status === "IMPORTED" ? "good" : "neutral"}>{String(row.status)}</Status>}</td><td className="right">{row.direction === "CREDIT" ? "+" : "−"}{money(row.amount_cents)}</td></tr>)}</tbody></table></div></State>
    <Feedback message={message} /><div className="dialog-actions"><button className="button ghost" onClick={onClose}>Fechar</button>{preview.data.status === "PREVIEW_READY" && <button className="button primary" disabled={busy || unresolved.length > 0 || issues.some((issue) => issue.severity === "ERROR")} onClick={() => void onRun(() => api(`/imports/${importId}/confirm`, { method: "POST" }))}><Check />Confirmar novos movimentos</button>}</div>
  </Dialog>;
}

export function AccountsPage() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const { data, loading, error, reload } = useApiData<{ items: Row[] }>("/bank-accounts", { items: [] });
  const action = useFormAction(async () => { setOpen(false); await reload(); });
  return <>
    <PageTitle eyebrow="CONTAS CORRENTES" title="Contas bancárias" description="Cada conta pertence somente a este condomínio e recebe seus próprios extratos." action={user?.role === "ADMIN" && <button className="button primary" onClick={() => setOpen(true)}><Plus />Nova conta</button>} />
    <State loading={loading} error={error} empty={!data.items.length}><div className="account-cards">{data.items.map((row) => <Card key={String(row.id)} className="bank-card"><div className="bank-card-top"><span className="bank-avatar large">{bankName(row.bank_code).slice(0, 1)}</span><div><h3>{String(row.description)}</h3><p>{bankName(row.bank_code)} · Ag. {String(row.branch_number)} · Cc. {String(row.account_number)}-{String(row.account_check_digit)}</p></div><Status tone={row.status === "ACTIVE" ? "good" : "neutral"}>{row.status === "ACTIVE" ? "Ativa" : "Inativa"}</Status></div><div className="bank-balance"><small>Saldo calculado</small><strong>{money(row.current_balance_cents)}</strong></div><div className="bank-meta"><span>Saldo inicial <b>{money(row.opening_balance_cents)}</b></span><span>Último registro <b>{dateBr(row.last_movement_date)}</b></span><span>Última importação <b>{dateBr(row.last_import_date)}</b></span></div></Card>)}</div></State>
    {open && <Dialog title="Cadastrar conta bancária" onClose={() => setOpen(false)}><form className="form-grid" onSubmit={submit(async (form) => { await action.run(() => api("/bank-accounts", { method: "POST", body: JSON.stringify({ bankCode: field(form, "bank"), branchNumber: field(form, "branch"), branchCheckDigit: "", accountNumber: field(form, "account"), accountCheckDigit: field(form, "digit"), branchAccountCheckDigit: "", description: field(form, "description"), accountType: "CHECKING", openingBalanceCents: cents(field(form, "balance")), openingBalanceDate: field(form, "date") }) })); })}><label>Banco<select name="bank"><option value="341">Itaú (341)</option><option value="748">Sicredi (748)</option></select></label><label>Descrição<input name="description" placeholder="Conta principal" required /></label><label>Agência<input name="branch" required /></label><label>Conta<input name="account" required /></label><label>Dígito<input name="digit" /></label><label>Data do saldo inicial<input type="date" name="date" defaultValue={today} required /></label><label className="span-2">Saldo inicial<input name="balance" inputMode="decimal" defaultValue="0,00" required /></label><Feedback message={action.message} /><div className="dialog-actions span-2"><button type="button" className="button ghost" onClick={() => setOpen(false)}>Cancelar</button><button className="button primary" disabled={action.busy}>Cadastrar conta</button></div></form></Dialog>}
  </>;
}

export function CatalogsPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<"chart" | "suppliers">("chart");
  const [open, setOpen] = useState(false);
  const chart = useApiData<{ items: Row[] }>("/chart-accounts", { items: [] });
  const suppliers = useApiData<{ items: Row[] }>("/suppliers", { items: [] });
  const reload = tab === "chart" ? chart.reload : suppliers.reload;
  const action = useFormAction(async () => { setOpen(false); await reload(); });
  const source = tab === "chart" ? chart : suppliers;
  return <>
    <PageTitle eyebrow="CADASTROS CONTÁBEIS" title="Plano e fornecedores" description="Estruture as classificações utilizadas nos rateios e organize os prestadores." action={user?.role !== "VIEWER" && <button className="button primary" onClick={() => setOpen(true)}><Plus />{tab === "chart" ? "Nova conta" : "Novo fornecedor"}</button>} />
    <div className="tabs"><button className={tab === "chart" ? "active" : ""} onClick={() => setTab("chart")}>Plano de contas</button><button className={tab === "suppliers" ? "active" : ""} onClick={() => setTab("suppliers")}>Fornecedores</button></div>
    <Card><State loading={source.loading} error={source.error} empty={!source.data.items.length}><div className="table-wrap">{tab === "chart" ? <table><thead><tr><th>Código</th><th>Conta</th><th>Nível</th><th>Natureza</th><th>Status</th></tr></thead><tbody>{chart.data.items.map((row) => <tr key={String(row.id)}><td><b className="mono">{String(row.code)}</b></td><td>{String(row.name)}</td><td>{String(row.level)}</td><td>{natureLabel(row.nature)}</td><td><Status tone={row.status === "ACTIVE" ? "good" : "neutral"}>{row.status === "ACTIVE" ? "Ativa" : "Inativa"}</Status></td></tr>)}</tbody></table> : <table><thead><tr><th>Fornecedor</th><th>Documento</th><th>Categoria</th><th>Contato</th><th>Status</th></tr></thead><tbody>{suppliers.data.items.map((row) => <tr key={String(row.id)}><td><b>{String(row.name)}</b></td><td>{String(row.tax_id ?? "—")}</td><td>{String(row.category ?? "—")}</td><td>{String(row.email ?? row.phone ?? "—")}</td><td><Status tone={row.status === "ACTIVE" ? "good" : "neutral"}>{row.status === "ACTIVE" ? "Ativo" : "Inativo"}</Status></td></tr>)}</tbody></table>}</div></State></Card>
    {open && tab === "chart" && <Dialog title="Nova conta contábil" onClose={() => setOpen(false)}><form className="form-grid" onSubmit={submit(async (form) => { await action.run(() => api("/chart-accounts", { method: "POST", body: JSON.stringify({ code: field(form, "code"), name: field(form, "name"), level: Number(field(form, "level")), nature: field(form, "nature") }) })); })}><label>Código<input name="code" required /></label><label>Nível<select name="level"><option value="1">1 · Grupo</option><option value="2">2 · Subgrupo</option><option value="3">3 · Analítica</option></select></label><label className="span-2">Nome<input name="name" required /></label><label className="span-2">Natureza<select name="nature"><option value="EXPENSE">Despesa</option><option value="INCOME">Receita</option><option value="NEUTRAL">Neutra</option></select></label><Feedback message={action.message} /><div className="dialog-actions span-2"><button type="button" className="button ghost" onClick={() => setOpen(false)}>Cancelar</button><button className="button primary" disabled={action.busy}>Criar conta</button></div></form></Dialog>}
    {open && tab === "suppliers" && <Dialog title="Novo fornecedor" onClose={() => setOpen(false)}><form className="form-grid" onSubmit={submit(async (form) => { await action.run(() => api("/suppliers", { method: "POST", body: JSON.stringify({ name: field(form, "name"), taxId: field(form, "taxId") || null, category: field(form, "category") || null, phone: field(form, "phone") || null, email: field(form, "email") || null }) })); })}><label className="span-2">Nome ou razão social<input name="name" required /></label><label>CPF/CNPJ<input name="taxId" /></label><label>Categoria<input name="category" /></label><label>Telefone<input name="phone" /></label><label>E-mail<input name="email" type="email" /></label><Feedback message={action.message} /><div className="dialog-actions span-2"><button type="button" className="button ghost" onClick={() => setOpen(false)}>Cancelar</button><button className="button primary" disabled={action.busy}>Cadastrar fornecedor</button></div></form></Dialog>}
  </>;
}

export function GovernancePage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<"funds" | "budgets" | "periods">("funds");
  const [open, setOpen] = useState(false);
  const [fundMovementOpen, setFundMovementOpen] = useState(false);
  const [budgetPlanId, setBudgetPlanId] = useState<string | null>(null);
  const funds = useApiData<{ items: Row[] }>("/funds", { items: [] });
  const budgets = useApiData<{ items: Row[] }>("/budgets", { items: [] });
  const periods = useApiData<{ items: Row[] }>("/periods", { items: [] });
  const chart = useApiData<{ items: Row[] }>("/chart-accounts", { items: [] });
  const action = useFormAction(async () => { setOpen(false); await Promise.all([funds.reload(), budgets.reload(), periods.reload()]); });
  const source = tab === "funds" ? funds : tab === "budgets" ? budgets : periods;
  return <>
    <PageTitle eyebrow="PLANEJAMENTO E CONTROLE" title="Governança financeira" description="Acompanhe fundos, orçamento anual e o bloqueio formal de períodos contábeis." action={user?.role === "ADMIN" && <button className="button primary" onClick={() => setOpen(true)}><Plus />{tab === "funds" ? "Novo fundo" : tab === "budgets" ? "Novo orçamento" : "Fechar período"}</button>} />
    <div className="tabs"><button className={tab === "funds" ? "active" : ""} onClick={() => setTab("funds")}>Fundos</button><button className={tab === "budgets" ? "active" : ""} onClick={() => setTab("budgets")}>Orçamentos</button><button className={tab === "periods" ? "active" : ""} onClick={() => setTab("periods")}>Fechamentos</button></div>
    {user?.role !== "VIEWER" && tab === "funds" && funds.data.items.length > 0 && <div className="sub-actions"><button className="button ghost" onClick={() => setFundMovementOpen(true)}><Plus />Movimentar fundo</button></div>}
    {user?.role === "ADMIN" && tab === "budgets" && budgets.data.items.length > 0 && <div className="sub-actions"><select aria-label="Orçamento" onChange={(event) => setBudgetPlanId(event.target.value || null)} value={budgetPlanId ?? ""}><option value="">Montar uma versão do orçamento…</option>{budgets.data.items.map((row) => <option key={String(row.id)} value={String(row.id)}>{String(row.fiscal_year)} · {String(row.name)}</option>)}</select></div>}
    <State loading={source.loading} error={source.error} empty={!source.data.items.length}>{tab === "funds" ? <div className="fund-grid">{funds.data.items.map((row) => <Card key={String(row.id)} className="fund-card"><span className="metric-icon purple"><WalletCards /></span><small>{String(row.purpose)}</small><h3>{String(row.name)}</h3><strong>{money(row.current_balance_cents)}</strong><em>Saldo atual</em></Card>)}</div> : <Card><div className="table-wrap">{tab === "budgets" ? <table><thead><tr><th>Ano</th><th>Orçamento</th><th>Versão aprovada</th><th>Versões</th><th>Status</th></tr></thead><tbody>{budgets.data.items.map((row) => <tr key={String(row.id)}><td><b>{String(row.fiscal_year)}</b></td><td>{String(row.name)}</td><td>{String(row.approved_version_number ?? "Sem aprovação")}</td><td>{String(row.version_count)}</td><td><Status tone={row.status === "ACTIVE" ? "good" : "neutral"}>{String(row.status)}</Status></td></tr>)}</tbody></table> : <table><thead><tr><th>Período</th><th>Status</th><th>Fechado por</th><th>Data</th><th>Versão</th><th /></tr></thead><tbody>{periods.data.items.map((row) => <tr key={String(row.id)}><td><b>{String(row.month_number).padStart(2, "0")}/{String(row.fiscal_year)}</b></td><td><Status tone={row.status === "CLOSED" ? "bad" : "good"}>{row.status === "CLOSED" ? "Fechado" : "Aberto"}</Status></td><td>{String(row.closed_by_name ?? "—")}</td><td>{dateBr(row.closed_at)}</td><td>{String(row.version)}</td><td>{row.status === "CLOSED" && user?.role === "ADMIN" && <button className="button small ghost" onClick={() => { const reason = window.prompt("Motivo para reabrir o período:"); if (reason) void action.run(() => api(`/periods/${String(row.id)}/reopen`, { method: "POST", body: JSON.stringify({ reason, expectedVersion: row.version }) })); }}>Reabrir</button>}</td></tr>)}</tbody></table>}</div></Card>}</State>
    {open && tab === "funds" && <Dialog title="Criar fundo" onClose={() => setOpen(false)}><form className="form-grid" onSubmit={submit(async (form) => { await action.run(() => api("/funds", { method: "POST", body: JSON.stringify({ name: field(form, "name"), purpose: field(form, "purpose"), openingBalanceCents: cents(field(form, "balance")), openingBalanceDate: field(form, "date") }) })); })}><label className="span-2">Nome<input name="name" required /></label><label className="span-2">Finalidade<textarea name="purpose" required /></label><label>Saldo inicial<input name="balance" defaultValue="0,00" required /></label><label>Data<input name="date" type="date" defaultValue={today} required /></label><Feedback message={action.message} /><div className="dialog-actions span-2"><button type="button" className="button ghost" onClick={() => setOpen(false)}>Cancelar</button><button className="button primary">Criar fundo</button></div></form></Dialog>}
    {open && tab === "budgets" && <Dialog title="Criar orçamento anual" onClose={() => setOpen(false)}><form className="form-grid" onSubmit={submit(async (form) => { await action.run(() => api("/budgets", { method: "POST", body: JSON.stringify({ fiscalYear: Number(field(form, "year")), name: field(form, "name") }) })); })}><label>Ano<input name="year" type="number" min="2000" max="9999" defaultValue={today.slice(0, 4)} required /></label><label>Nome<input name="name" defaultValue={`Orçamento ${today.slice(0, 4)}`} required /></label><div className="notice span-2"><AlertCircle />Após criar, selecione o orçamento para preencher a grade mensal e aprovar sua primeira versão.</div><Feedback message={action.message} /><div className="dialog-actions span-2"><button type="button" className="button ghost" onClick={() => setOpen(false)}>Cancelar</button><button className="button primary">Criar orçamento</button></div></form></Dialog>}
    {open && tab === "periods" && <Dialog title="Fechar período" onClose={() => setOpen(false)}><form className="form-grid" onSubmit={submit(async (form) => { await action.run(() => api("/periods/close", { method: "POST", body: JSON.stringify({ fiscalYear: Number(field(form, "period").slice(0, 4)), monthNumber: Number(field(form, "period").slice(5, 7)), reason: field(form, "reason") || null, force: new FormData(form).get("force") === "on" }) })); })}><label className="span-2">Competência<input name="period" type="month" defaultValue={currentPeriod} required /></label><label className="span-2">Observação<textarea name="reason" /></label><label className="check span-2"><input type="checkbox" name="force" />Fechar mesmo com pendências de classificação ou comprovantes</label><Feedback message={action.message} /><div className="dialog-actions span-2"><button type="button" className="button ghost" onClick={() => setOpen(false)}>Cancelar</button><button className="button primary">Fechar período</button></div></form></Dialog>}
    {fundMovementOpen && <Dialog title="Movimentar fundo" onClose={() => setFundMovementOpen(false)}><form className="form-grid" onSubmit={submit(async (form) => { const fundId = field(form, "fund"); const ok = await action.run(() => api(`/funds/${fundId}/movements`, { method: "POST", body: JSON.stringify({ fundId, movementType: field(form, "type"), direction: field(form, "direction"), amountCents: cents(field(form, "amount")), accountingDate: field(form, "date"), justification: field(form, "justification") }) })); if (ok) setFundMovementOpen(false); })}><label className="span-2">Fundo<select name="fund" required><option value="">Selecione</option>{funds.data.items.map((row) => <option key={String(row.id)} value={String(row.id)}>{String(row.name)}</option>)}</select></label><label>Tipo<select name="type"><option value="CONTRIBUTION">Contribuição</option><option value="WITHDRAWAL">Retirada</option><option value="INCOME">Rendimento</option><option value="ADJUSTMENT">Ajuste</option></select></label><label>Natureza<select name="direction"><option value="CREDIT">Crédito</option><option value="DEBIT">Débito</option></select></label><label>Valor<input name="amount" placeholder="0,00" required /></label><label>Data contábil<input type="date" name="date" defaultValue={today} required /></label><label className="span-2">Justificativa<textarea name="justification" required minLength={3} /></label><Feedback message={action.message} /><div className="dialog-actions span-2"><button type="button" className="button ghost" onClick={() => setFundMovementOpen(false)}>Cancelar</button><button className="button primary">Salvar movimento</button></div></form></Dialog>}
    {budgetPlanId && <BudgetPlanDialog budget={budgets.data.items.find((row) => row.id === budgetPlanId) ?? { id: budgetPlanId }} chart={chart.data.items} onClose={() => setBudgetPlanId(null)} onSaved={async () => { setBudgetPlanId(null); await budgets.reload(); }} />}
  </>;
}

type BudgetLine = { key: string; accountId: string; months: string[] };
const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function BudgetPlanDialog({ budget, chart, onClose, onSaved }: { budget: Row; chart: Row[]; onClose: () => void; onSaved: () => void | Promise<void> }) {
  const [lines, setLines] = useState<BudgetLine[]>([{ key: crypto.randomUUID(), accountId: "", months: Array.from({ length: 12 }, () => "0,00") }]);
  const [reason, setReason] = useState("");
  const action = useFormAction(onSaved);
  const update = (key: string, change: Partial<BudgetLine>) => setLines((current) => current.map((line) => line.key === key ? { ...line, ...change } : line));
  const save = () => action.run(async () => {
    if (lines.some((line) => !line.accountId)) throw new Error("Selecione uma conta contábil em cada linha.");
    if (new Set(lines.map((line) => line.accountId)).size !== lines.length) throw new Error("Cada conta contábil deve aparecer uma única vez.");
    const items = lines.flatMap((line) => line.months.map((amount, month) => ({ chartAccountId: line.accountId, monthNumber: month + 1, amountCents: Math.max(0, cents(amount)) })));
    const version = await api<{ id: string }>(`/budgets/${String(budget.id)}/versions`, { method: "POST", body: JSON.stringify({ versionType: Number(budget.version_count) > 0 ? "REVISED" : "ORIGINAL", reason: reason || null, items }) });
    await api(`/budgets/${String(budget.id)}/versions/${version.id}/approve`, { method: "POST" });
  });
  return <Dialog title={`Planejar ${String(budget.name ?? "orçamento")}`} wide onClose={onClose}>
    <div className="budget-intro"><div><small>Exercício</small><strong>{String(budget.fiscal_year ?? "")}</strong></div><p>Preencha valores mensais por conta. Ao salvar, a versão é aprovada e se torna imutável; uma alteração posterior cria nova revisão.</p></div>
    <div className="budget-sheet"><table><thead><tr><th>Conta contábil</th>{monthNames.map((month) => <th key={month}>{month}</th>)}<th /></tr></thead><tbody>{lines.map((line) => <tr key={line.key}><td><select value={line.accountId} onChange={(event) => update(line.key, { accountId: event.target.value })}><option value="">Selecione…</option>{chart.filter((row) => row.status === "ACTIVE").map((row) => <option value={String(row.id)} key={String(row.id)}>{String(row.code)} · {String(row.name)}</option>)}</select></td>{line.months.map((value, month) => <td key={month}><input aria-label={`${monthNames[month]} em reais`} value={value} onChange={(event) => { const months = [...line.months]; months[month] = event.target.value; update(line.key, { months }); }} /></td>)}<td><button className="icon-button sheet-remove" disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))}><X /></button></td></tr>)}</tbody></table></div>
    <div className="budget-controls"><button className="button ghost" onClick={() => setLines((current) => [...current, { key: crypto.randomUUID(), accountId: "", months: Array.from({ length: 12 }, () => "0,00") }])}><Plus />Adicionar conta</button><label>Motivo da versão<input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Opcional na versão original" /></label></div>
    <Feedback message={action.message} /><div className="dialog-actions"><button className="button ghost" onClick={onClose}>Cancelar</button><button className="button primary" disabled={action.busy} onClick={() => void save()}><Check />Salvar e aprovar versão</button></div>
  </Dialog>;
}

export function ReportsPage() {
  const [period, setPeriod] = useState(currentPeriod);
  const [tab, setTab] = useState<"trial" | "budget" | "reconciliation">("trial");
  const trial = useApiData<{ rows: Row[]; unclassified?: Row }>(`/reports/trial-balance?period=${period}`, { rows: [] });
  const budget = useApiData<{ items: Row[] }>(`/reports/budget-comparison?period=${period}`, { items: [] });
  const reconciliation = useApiData<{ items: Row[] }>("/reports/reconciliation", { items: [] });
  const source = tab === "trial" ? { ...trial, data: { items: trial.data.rows } } : tab === "budget" ? budget : reconciliation;
  return <>
    <PageTitle eyebrow="PRESTAÇÃO DE CONTAS" title="Relatórios" description="Relatórios sempre calculados pela data contábil, sem usar os saldos declarados no extrato." action={<div className="toolbar"><input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} /><a className="button ghost" href={`/api/reports/accountability.pdf?period=${period}`}><Download />Livro + índice</a><a className="button ghost" href={`/api/reports/accountability.pdf?period=${period}&includeDocuments=1`}><Paperclip />Livro completo</a><a className="button primary" href={`/api/reports/trial-balance.pdf?period=${period}`}><Download />Balancete PDF</a></div>} />
    <div className="tabs"><button className={tab === "trial" ? "active" : ""} onClick={() => setTab("trial")}>Balancete</button><button className={tab === "budget" ? "active" : ""} onClick={() => setTab("budget")}>Orçado × realizado</button><button className={tab === "reconciliation" ? "active" : ""} onClick={() => setTab("reconciliation")}>Conciliação</button></div>
    <Card><State loading={source.loading} error={source.error} empty={!source.data.items.length}><div className="table-wrap">{tab === "trial" ? <table><thead><tr><th>Código</th><th>Conta</th><th>Natureza</th><th className="right">Débitos</th><th className="right">Créditos</th><th className="right">Saldo</th></tr></thead><tbody>{trial.data.rows.map((row) => <tr key={String(row.id)}><td><b className="mono">{String(row.code)}</b></td><td>{String(row.name)}</td><td>{natureLabel(row.nature)}</td><td className="right">{money(row.debit_cents)}</td><td className="right">{money(row.credit_cents)}</td><td className="right"><b>{money(row.net_cents)}</b></td></tr>)}</tbody></table> : tab === "budget" ? <table><thead><tr><th>Código</th><th>Conta</th><th className="right">Orçado</th><th className="right">Realizado</th><th className="right">Variação</th></tr></thead><tbody>{budget.data.items.map((row) => <tr key={`${String(row.code)}-${String(row.name)}`}><td><b>{String(row.code)}</b></td><td>{String(row.name)}</td><td className="right">{money(row.planned_cents)}</td><td className="right">{money(row.actual_cents)}</td><td className="right"><b>{money(Number(row.planned_cents) - Number(row.actual_cents))}</b></td></tr>)}</tbody></table> : <table><thead><tr><th>Conta</th><th>Banco</th><th className="right">Saldo financeiro</th><th className="right">Saldo contábil</th><th className="right">Diferença</th><th>Status</th></tr></thead><tbody>{reconciliation.data.items.map((row) => <tr key={String(row.id)}><td><b>{String(row.description)}</b></td><td>{bankName(row.bank_code)}</td><td className="right">{money(row.financial_balance_cents)}</td><td className="right">{money(row.accounting_balance_cents)}</td><td className="right">{money(row.difference_cents)}</td><td><Status tone={Number(row.difference_cents) === 0 ? "good" : "bad"}>{Number(row.difference_cents) === 0 ? "Conciliado" : "Divergente"}</Status></td></tr>)}</tbody></table>}</div></State></Card>
  </>;
}

export function AdminPage() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const users = useApiData<{ items: Row[] }>(user?.role === "ADMIN" ? "/users" : null, { items: [] });
  const audit = useApiData<{ items: Row[] }>(user?.role === "ADMIN" ? "/reports/audit?limit=100" : null, { items: [] });
  const action = useFormAction(async () => { setOpen(false); await users.reload(); });
  if (user?.role !== "ADMIN") return <><PageTitle eyebrow="ADMINISTRAÇÃO" title="Acesso restrito" description="Somente administradores do condomínio podem gerenciar usuários e consultar a trilha de auditoria." /><div className="callout"><ShieldCheck /><div><strong>Seu perfil é {String(user?.role)}</strong><p>As demais áreas de consulta permanecem disponíveis conforme suas permissões.</p></div></div></>;
  return <>
    <PageTitle eyebrow="ADMINISTRAÇÃO DO CONDOMÍNIO" title="Usuários e auditoria" description="Controle acessos e acompanhe as ações relevantes executadas no sistema." action={<button className="button primary" onClick={() => setOpen(true)}><Plus />Novo usuário</button>} />
    <Card title="Usuários" subtitle="Cada usuário pertence exclusivamente a este condomínio."><State loading={users.loading} error={users.error} empty={!users.data.items.length}><div className="table-wrap"><table><thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Status</th><th>Último acesso</th></tr></thead><tbody>{users.data.items.map((row) => <tr key={String(row.id)}><td><b>{String(row.display_name)}</b></td><td>{String(row.email)}</td><td>{roleText(row.role)}</td><td><Status tone={row.status === "ACTIVE" ? "good" : "neutral"}>{String(row.status)}</Status></td><td>{dateBr(row.last_login_at)}</td></tr>)}</tbody></table></div></State></Card>
    <Card title="Trilha de auditoria" subtitle="Histórico imutável de alterações críticas." className="section-gap"><State loading={audit.loading} error={audit.error} empty={!audit.data.items.length}><div className="timeline">{audit.data.items.map((row) => <div key={String(row.id)}><span className="timeline-dot" /><div><strong>{String(row.action)} · {String(row.entity_type)}</strong><p>{String(row.actor_name)} · {String(row.actor_email)}</p><small>{new Date(String(row.created_at)).toLocaleString("pt-BR")} · req. {String(row.request_id).slice(0, 8)}</small></div></div>)}</div></State></Card>
    {open && <Dialog title="Criar usuário" onClose={() => setOpen(false)}><form className="form-grid" onSubmit={submit(async (form) => { await action.run(() => api("/users", { method: "POST", body: JSON.stringify({ displayName: field(form, "name"), email: field(form, "email"), password: field(form, "password"), role: field(form, "role") }) })); })}><label className="span-2">Nome<input name="name" required /></label><label className="span-2">E-mail<input type="email" name="email" required /></label><label>Perfil<select name="role"><option value="OPERATOR">Operador</option><option value="VIEWER">Consulta</option><option value="ADMIN">Administrador</option></select></label><label>Senha temporária<input type="password" name="password" minLength={12} required /></label><Feedback message={action.message} /><div className="dialog-actions span-2"><button type="button" className="button ghost" onClick={() => setOpen(false)}>Cancelar</button><button className="button primary">Criar usuário</button></div></form></Dialog>}
  </>;
}

export function TenantsPage() {
  const [open, setOpen] = useState(false);
  const { data, loading, error, reload } = useApiData<{ items: Row[] }>("/tenants", { items: [] });
  const action = useFormAction(async () => { setOpen(false); await reload(); });
  return <>
    <PageTitle eyebrow="GESTÃO GLOBAL" title="Condomínios" description="Cadastre ambientes isolados. Cada condomínio terá usuários, contas e movimentos próprios." action={<button className="button primary" onClick={() => setOpen(true)}><Plus />Novo condomínio</button>} />
    <div className="metrics compact-metrics"><div className="metric accent"><span className="metric-icon"><Building2 /></span><small>Condomínios</small><strong>{data.items.length}</strong><em>Ambientes cadastrados</em></div><div className="metric"><span className="metric-icon green"><ShieldCheck /></span><small>Isolamento</small><strong>Ativo</strong><em>Tenant por sessão</em></div></div>
    <Card><State loading={loading} error={error} empty={!data.items.length}><div className="table-wrap"><table><thead><tr><th>Condomínio</th><th>CNPJ</th><th>Unidades</th><th>Início fiscal</th><th>Status</th><th>Criado em</th></tr></thead><tbody>{data.items.map((row) => <tr key={String(row.id)}><td><b>{String(row.name)}</b></td><td className="mono">{formatCnpj(String(row.cnpj))}</td><td>{String(row.unit_count)}</td><td>Mês {String(row.fiscal_year_start_month)}</td><td><Status tone={row.status === "ACTIVE" ? "good" : "neutral"}>{String(row.status)}</Status></td><td>{dateBr(row.created_at)}</td></tr>)}</tbody></table></div></State></Card>
    {open && <Dialog title="Novo condomínio" wide onClose={() => setOpen(false)}><form className="form-grid" onSubmit={submit(async (form) => { await action.run(() => api("/tenants", { method: "POST", body: JSON.stringify({ name: field(form, "name"), cnpj: field(form, "cnpj").replace(/\D/g, ""), unitCount: Number(field(form, "units")), fiscalYearStartMonth: Number(field(form, "fiscal")), admin: { displayName: field(form, "adminName"), email: field(form, "email"), password: field(form, "password"), role: "ADMIN" } }) })); })}><h3 className="form-section span-2">Dados do condomínio</h3><label className="span-2">Nome<input name="name" required /></label><label>CNPJ<input name="cnpj" placeholder="00.000.000/0000-00" required /></label><label>Número de unidades<input name="units" type="number" min="0" defaultValue="0" /></label><label>Início do exercício fiscal<select name="fiscal">{Array.from({ length: 12 }, (_, index) => <option value={index + 1} key={index}>{new Date(2024, index).toLocaleString("pt-BR", { month: "long" })}</option>)}</select></label><span /><h3 className="form-section span-2">Primeiro administrador</h3><label>Nome<input name="adminName" required /></label><label>E-mail<input name="email" type="email" required /></label><label className="span-2">Senha inicial<input name="password" type="password" minLength={12} required /></label><Feedback message={action.message} /><div className="dialog-actions span-2"><button type="button" className="button ghost" onClick={() => setOpen(false)}>Cancelar</button><button className="button primary">Criar ambiente</button></div></form></Dialog>}
  </>;
}

function bankName(code: unknown) { return String(code) === "341" ? "Itaú" : String(code) === "748" ? "Sicredi" : `Banco ${String(code ?? "")}`; }
function classificationLabel(value: unknown) { return ({ UNCLASSIFIED: "A classificar", PARTIAL: "Parcial", CLASSIFIED: "Classificado", DIVERGENT: "Divergente", INCOME: "Receita", EXPENSE: "Despesa", TRANSFER: "Transferência", ADJUSTMENT: "Ajuste", FUND: "Fundo", IGNORED: "Ignorado" } as Record<string, string>)[String(value)] ?? String(value); }
function importLabel(value: unknown) { return ({ PREVIEW_READY: "Aguardando confirmação", CONFIRMING: "Confirmando", COMPLETED: "Concluída", REJECTED: "Rejeitada", FAILED: "Falhou", PARSING: "Analisando", UPLOADED: "Enviada" } as Record<string, string>)[String(value)] ?? String(value); }
function natureLabel(value: unknown) { return ({ INCOME: "Receita", EXPENSE: "Despesa", NEUTRAL: "Neutra" } as Record<string, string>)[String(value)] ?? String(value); }
function roleText(value: unknown) { return ({ ADMIN: "Administrador", OPERATOR: "Operador", VIEWER: "Consulta" } as Record<string, string>)[String(value)] ?? String(value); }
function formatCnpj(value: string) { return value.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5"); }
