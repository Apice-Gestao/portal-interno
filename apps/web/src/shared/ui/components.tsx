import * as Dialog from "@radix-ui/react-dialog";
import { CloseIcon, EmptyTrayIcon, LoadingIcon } from "../icons";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { hasPermission } from "@apice/domain";
import { usePortal } from "../../app/usePortal";
import { CompetencePicker } from "./CompetencePicker";
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  wide = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content
          className={`modal-content ${wide ? "modal-wide" : ""}`}
          // TEMPORARY demo tour: its balloon sits outside the window.
          onInteractOutside={(event) => {
            if ((event.target as HTMLElement | null)?.closest?.(".demo-tour"))
              event.preventDefault();
          }}
        >
          <div className="modal-heading">
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close className="icon-button" aria-label="Fechar janela">
              <CloseIcon size={19} />
            </Dialog.Close>
          </div>
          <Dialog.Description
            className={description ? "modal-description" : "sr-only"}
          >
            {description ?? title}
          </Dialog.Description>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function EmptyState({
  title = "Nenhum resultado encontrado",
  text = "Ajuste os filtros para encontrar o que procura.",
  action,
}: {
  title?: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <EmptyTrayIcon size={30} />
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}
export function PageHeading({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      <div className="heading-actions">{children}</div>
    </div>
  );
}
// Picking a day opens Tasks filtered by that due date (meta or legal), when the account can see tasks.
export function CompetenceSelect() {
  const { actor, competence, setCompetence } = usePortal();
  const navigate = useNavigate();
  return (
    <CompetencePicker
      value={competence}
      onValueChange={setCompetence}
      dayAction={
        hasPermission(actor, "tasks.view")
          ? {
              label: "Ver vencimentos de",
              onSelect: (day) =>
                navigate(`/tarefas?dueDate=${day}&dueMode=both`),
            }
          : undefined
      }
    />
  );
}
export function Busy({
  busy,
  children,
}: {
  busy: boolean;
  children: ReactNode;
}) {
  return (
    <>
      {busy && <LoadingIcon className="spin" size={16} />} {children}
    </>
  );
}
export function FormError({ message }: { message: string }) {
  return message ? (
    <p className="form-error" role="alert">
      {message}
    </p>
  ) : null;
}
