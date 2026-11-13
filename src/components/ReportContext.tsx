import { useState } from "react";

const fields = [
  { key: "height", label: "Altura", unit: "cm" },
  { key: "weight", label: "Peso corporal", unit: "kg" },
  { key: "waist", label: "Perímetro abdominal", unit: "cm" },
  { key: "hba1c", label: "HbA1c", unit: "%" },
] as const;
const disclaimer =
  "Datos aportados por el usuario, exclusivamente para incluirlos en el informe impreso. No se utilizan en los cálculos ni en el análisis de glucosa.";

export function ReportContext() {
  const [sex, setSex] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const provided = fields.filter(
    ({ key }) =>
      Number(values[key]) > 0 && Number.isFinite(Number(values[key])),
  );
  const hasData = Boolean(sex || provided.length);
  return (
    <section className="report-context">
      <details className="no-print">
        <summary>
          Datos personales para la impresión <span>· opcional</span>
        </summary>
        <p className="report-context-note">{disclaimer}</p>
        <div className="report-context-fields">
          <label>
            Sexo
            <select value={sex} onChange={(e) => setSex(e.target.value)}>
              <option value="">Sin indicar</option>
              <option>Femenino</option>
              <option>Masculino</option>
              <option>Intersexual</option>
              <option>Prefiero no indicarlo</option>
            </select>
          </label>
          {fields.map(({ key, label, unit }) => (
            <label key={key}>
              {label} ({unit})
              <input
                type="number"
                min="0.1"
                step="any"
                inputMode="decimal"
                value={values[key] || ""}
                placeholder="Sin indicar"
                onChange={(e) =>
                  setValues({ ...values, [key]: e.target.value })
                }
              />
              {values[key] && !(Number(values[key]) > 0) && (
                <small role="alert">Introduce un valor mayor que cero.</small>
              )}
            </label>
          ))}
        </div>
        <div className="report-context-actions">
          <small>
            Solo se imprimen los campos cumplimentados. Estos datos se borran al
            recargar o cerrar la página.
          </small>
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setSex("");
              setValues({});
            }}
          >
            Vaciar campos
          </button>
        </div>
      </details>
      {hasData && (
        <div className="report-context-print">
          <strong>Datos personales aportados para este informe</strong>
          <dl>
            {sex && (
              <div>
                <dt>Sexo</dt>
                <dd>{sex}</dd>
              </div>
            )}
            {provided.map(({ key, label, unit }) => (
              <div key={key}>
                <dt>{label}</dt>
                <dd>
                  {Number(values[key]).toLocaleString("es-ES", {
                    maximumFractionDigits: 3,
                  })}{" "}
                  {unit}
                </dd>
              </div>
            ))}
          </dl>
          <small>{disclaimer}</small>
        </div>
      )}
    </section>
  );
}
