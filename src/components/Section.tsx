import type { ReactNode } from "react";
export function Section({
  id,
  index,
  title,
  note,
  aside,
  children,
  className = "",
}: {
  id: string;
  index?: string;
  title: string;
  note?: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={`panel ${className}`}>
      <div className="section-heading">
        <div>
          <div className="title-row">
            {index && <span className="section-index">{index}</span>}
            <h2>{title}</h2>
          </div>
          {note && <p>{note}</p>}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}
export const EmptyChart = ({ children }: { children?: ReactNode }) => (
  <div className="empty-chart">
    <span aria-hidden="true">∿</span>
    <p>Se necesitan más datos para esta visualización.</p>
    <small>
      {children ||
        "Carga una exportación de varios días para explorar patrones."}
    </small>
  </div>
);
