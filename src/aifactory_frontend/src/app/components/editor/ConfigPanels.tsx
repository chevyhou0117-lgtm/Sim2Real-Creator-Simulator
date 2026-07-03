import React from "react";
import { Plus, Edit2, WifiOff, Link2 } from "lucide-react";
import type { FactoryNode } from "../../../types/factoryEditor";
import type { BindingRecord } from "../../../types/factoryEditor";
import { mockDataPoints } from "../../data/mockData";
import { proxyMinioUrl } from "../../utils/minioProxy";
import { t, useLocalized } from "../../utils/i18n";
import {
  ConfigSection,
  ConfigRow,
  IoTField,
  CollapsibleSection,
} from "./UiComponents";
import { DataBindingSection } from "./BindingComponents";

export function FactoryConfigPanel({
  editing,
  node,
  nodeDetail,
  nodeId,
  platformConnected,
  basicDataBinding,
  onBindBasicData,
  onUnbindBasicData,
}: {
  editing: boolean;
  node: FactoryNode;
  nodeDetail: any;
  nodeId: string;
  platformConnected: boolean;
  basicDataBinding?: BindingRecord;
  onBindBasicData: () => void;
  onUnbindBasicData: () => void;
}) {
  const L = useLocalized();
  console.log("FactoryConfigPanel node", node);
  console.log("FactoryConfigPanel nodeDetail", nodeDetail);
  return (
    <div className="p-3 space-y-4">
      {/* <DataBindingSection
        nodeId={nodeId}
        nodeType="FACTORY"
        label="Business Data Binding (Required)"
        platformConnected={platformConnected}
        bindingRecord={basicDataBinding}
        onBind={onBindBasicData}
        onUnbind={onUnbindBasicData}
      /> */}

      <ConfigSection title={t("config.basicInformation")}>
        <ConfigRow
          label={t("config.factoryName")}
          value={L(node, 'name', 'nameEn') || "-"}
          editing={editing}
        />
        <ConfigRow label={t("config.hierarchy")} value={t("config.nodeFactory")} editing={editing} />
        <ConfigRow
          label={t("config.usdFile")}
          value={nodeDetail?.rootUsdPath || "-"}
          editing={editing}
        />
        <ConfigRow
          label={t("config.siteArea")}
          value={`${nodeDetail?.siteArea || "--"} m²`}
          editing={editing}
        />
        <ConfigRow
          label={t("config.address")}
          value={nodeDetail?.location || "-"}
          editing={editing}
        />
      </ConfigSection>

      <ConfigSection title={t("config.capacityInformation")}>
        <ConfigRow
          label={t("config.annualCapacity")}
          value={`${node?.polyCount ?? "-"} ${t("config.pieces")}`}
          editing={editing}
        />
      </ConfigSection>

      <ConfigSection title={t("config.otherInformation")}>
        <div className="rounded overflow-hidden border border-[var(--c-1e3a55)] mt-1">
          <img
            src={proxyMinioUrl(nodeDetail?.thumbnailUrl)}
            alt="Factory Thumbnail"
            className="w-full h-28 object-cover opacity-70"
          />
        </div>
      </ConfigSection>
    </div>
  );
}

export function ProcessConfigPanel({
  node,
  editing,
}: {
  node: FactoryNode;
  editing: boolean;
}) {
  const L = useLocalized();
  return (
    <div className="p-3 space-y-4">
      <ConfigSection title={t("config.basicInformation")}>
        <ConfigRow
          label={t("config.processCode")}
          value={node?.code || "-"}
          editing={editing}
        />
        <ConfigRow label={t("config.processName")} value={L(node, 'name', 'nameEn')} editing={editing} />
        <ConfigRow
          label={t("config.lineCount")}
          value={`${node?.children?.length ?? 0} ${t("config.lines")}`}
        />
        <ConfigRow
          label={t("config.orderInFlow")}
          value="1"
          editing={editing}
        />
      </ConfigSection>
      <ConfigSection title={t("config.productionInformation")}>
        <ConfigRow
          label={t("config.capacity")}
          value={`${node?.capacity ?? 0} ${t("config.piecesPerDay")}`}
          editing={editing}
        />
      </ConfigSection>
    </div>
  );
}

export function LineConfigPanel({
  node,
  nodeDetail,
  editing,
  platformConnected,
  bindingRecord,
  onBind,
  onUnbind,
}: {
  node: FactoryNode;
  nodeDetail: any;
  editing: boolean;
  platformConnected: boolean;
  bindingRecord?: BindingRecord;
  onBind: () => void;
  onUnbind: () => void;
}) {
  const L = useLocalized();
  return (
    <div className="p-3 space-y-4">
      <DataBindingSection
        node={node}
        nodeId={node?.id}
        nodeType="LINE"
        label="Business Data Binding (Required)"
        platformConnected={platformConnected}
        bindingRecord={bindingRecord}
        onBind={onBind}
        onUnbind={onUnbind}
      />

      <ConfigSection title={t("config.basicInformation")}>
        <ConfigRow
          label={t("config.lineName")}
          value={L(nodeDetail?.baseLine, 'lineName', 'lineNameEn')}
          editing={editing}
        />
        <ConfigRow
          label={t("config.lineCode")}
          value={nodeDetail?.baseLine?.lineCode || "-"}
          editing={editing}
        />
        <ConfigRow
          label={t("config.belongsToProcess")}
          value={nodeDetail?.baseLine?.processName || "-"}
          editing={editing}
        />
        <ConfigRow
          label={t("config.remarks")}
          value={L(nodeDetail?.baseLine, 'remarks', 'remarksEn') || "-"}
          editing={editing}
        />
      </ConfigSection>

      <ConfigSection title={t("config.leaderInformation")}>
        <ConfigRow
          label={t("config.lineLeader")}
          value={nodeDetail?.baseLine?.leader || "-"}
          editing={editing}
        />
        <ConfigRow
          label={t("config.contact")}
          value={nodeDetail?.baseLine?.contact || "-"}
          editing={editing}
        />
      </ConfigSection>
    </div>
  );
}

export function LedgerPanel({
  node,
  nodeDetail,
  editing,
  platformConnected,
  bindingRecord,
  onBind,
  onUnbind,
}: {
  node: FactoryNode;
  nodeDetail: any;
  editing: boolean;
  platformConnected: boolean;
  bindingRecord?: BindingRecord;
  onBind: () => void;
  onUnbind: () => void;
}) {
  const L = useLocalized();
  return (
    <div className="p-3 space-y-3">
      <DataBindingSection
        node={node}
        nodeId={node?.id}
        nodeType="EQUIPMENT"
        platformConnected={platformConnected}
        bindingRecord={bindingRecord}
        onBind={onBind}
        onUnbind={onUnbind}
      />

      <ConfigSection title={t("config.basicInformation")}>
        <ConfigRow
          label={t("config.equipmentCode")}
          value={nodeDetail?.baseEquipment?.equipmentCode || "-"}
          editing={editing}
        />
        <ConfigRow
          label={t("config.equipmentName")}
          value={nodeDetail?.baseEquipment?.equipmentName || "-"}
          editing={editing}
        />
        <ConfigRow
          label={t("config.equipmentType")}
          value={nodeDetail?.baseEquipment?.equipmentType || "-"}
          editing={editing}
        />
        <ConfigRow
          label={t("config.equipmentGroup")}
          value={nodeDetail?.baseEquipment?.equipmentGroup || "-"}
          editing={editing}
        />
        <ConfigRow label={t("config.brand")} value={t("config.nodeBasicManufacturer")} editing={editing} />
        <ConfigRow
          label={t("config.manufacturer")}
          value={nodeDetail?.baseEquipment?.manufacturer || "-"}
          editing={editing}
        />
        <ConfigRow label={t("config.model")} value={t("config.nodeBasicModel")} editing={editing} />
        <ConfigRow
          label={t("config.productionDate")}
          value={nodeDetail?.baseEquipment?.productionDate || "-"}
          editing={editing}
        />
        <ConfigRow
          label={t("config.serialNumber")}
          value={nodeDetail?.baseEquipment?.serialNumber || "-"}
          editing={editing}
        />
        <ConfigRow label={t("config.origin")} value={t("config.nodeBasicOrigin")} editing={editing} />
        <ConfigRow label={t("config.supplier")} value={node?.supplier} editing={editing} />
        <ConfigRow
          label={t("config.supplierPhone")}
          value={nodeDetail?.baseEquipment?.supplierPhone || "-"}
          editing={editing}
        />
        <ConfigRow
          label={t("config.purchaseDate")}
          value={nodeDetail?.baseEquipment?.purchaseDate || "-"}
          editing={editing}
        />
        <ConfigRow
          label={t("config.serviceLife")}
          value={nodeDetail?.baseEquipment?.serviceLife || "-"}
          editing={editing}
        />
        <ConfigRow
          label={t("config.equipmentUnit")}
          value={nodeDetail?.baseEquipment?.unit || "-"}
          editing={editing}
        />
        <ConfigRow
          label={t("config.location")}
          value={nodeDetail?.baseEquipment?.location || "-"}
          editing={editing}
        />
        <ConfigRow
          label={t("config.imagePath")}
          value={node?.primPath || "-"}
          editing={editing}
        />
        <ConfigRow
          label={t("config.responsiblePerson")}
          value={node?.responsiblePerson}
          editing={editing}
        />
        <ConfigRow
          label={t("config.assetNumber")}
          value={node?.assetNumber}
          editing={editing}
        />
      </ConfigSection>

      <CollapsibleSection title={t("config.technicalSpecifications")}>
        <ConfigRow
          label={t("config.mainTechnicalParameters")}
          value={node?.mainTechnicalParameters}
          editing={editing}
        />
        <ConfigRow label={t("config.power")} value={t("config.nodeBasicPower")} editing={editing} />
        <ConfigRow
          label={t("config.dimensions")}
          value={node?.dimensions}
          editing={editing}
        />
        <ConfigRow label={t("config.weight")} value={t("config.nodeBasicWeight")} editing={editing} />
      </CollapsibleSection>

      <CollapsibleSection title={t("config.processParameters")}>
        <ConfigRow
          label={t("config.standardCycleTime")}
          value={node?.standardCycleTime}
          editing={editing}
        />
        <ConfigRow
          label={t("config.standardYieldRate")}
          value={node?.standardYieldRate}
          editing={editing}
        />
        <ConfigRow
          label={t("config.standardOperationEfficiency")}
          value={node?.standardOperationEfficiency}
          editing={editing}
        />
      </CollapsibleSection>

      <CollapsibleSection title={t("config.faultParameters")}>
        <ConfigRow label={t("config.mtbf")} value={node?.mtbf} editing={editing} />
        <ConfigRow label={t("config.mttr")} value={node?.mttr} editing={editing} />
      </CollapsibleSection>

      <CollapsibleSection title={t("config.sparePartsBOM")}>
        <div className="text-[10px] text-slate-500 py-1">
          {t("config.sparePartsDesc")}
        </div>
        <button className="text-[10px] text-blue-400 hover:text-blue-300 flex items-center gap-1 mt-1">
          <Plus size={10} /> {t("config.addSparePart")}
        </button>
      </CollapsibleSection>

      <CollapsibleSection title={t("config.equipmentSOP")}>
        <div className="text-[10px] text-slate-500 py-1">
          {t("config.docIdDesc")}
        </div>
        <button className="text-[10px] text-blue-400 hover:text-blue-300 flex items-center gap-1 mt-1">
          <Link2 size={10} /> {t("config.linkDocument")}
        </button>
      </CollapsibleSection>

      <CollapsibleSection title={t("config.operationRecords")}>
        <div className="text-[10px] text-slate-500 py-1">
          {t("config.recordIdDesc")}
        </div>
        <button className="text-[10px] text-blue-400 hover:text-blue-300 flex items-center gap-1 mt-1">
          <Plus size={10} /> {t("config.viewAllRecords")}
        </button>
      </CollapsibleSection>
    </div>
  );
}

export function IoTPanel({
  node,
  editing,
  bindingRecord,
  locked,
}: {
  node: FactoryNode;
  editing: boolean;
  bindingRecord?: BindingRecord;
  locked: boolean;
}) {
  const L = useLocalized();
  const isConfigured =
    node?.iotConfigured ??
    (bindingRecord?.status === "partial" || bindingRecord?.status === "bound");
  return (
    <div className="p-3 space-y-3">
      {locked && (
        <div className="flex items-center gap-1.5 p-2 bg-[var(--c-040d18)] border border-[var(--c-1e3a55)] rounded text-[10px] text-slate-500">
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="flex-shrink-0"
          >
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          {t("config.lockMessage")}
        </div>
      )}
      {!locked && bindingRecord && (
        <DataBindingSection
          nodeId={node?.id}
          nodeType="equipment"
          label={t("config.iotAutoImported")}
          platformConnected={true}
          bindingRecord={bindingRecord}
          onBind={() => {}}
          onUnbind={() => {}}
        />
      )}
      <ConfigSection title={t("config.basicInformation")}>
        <ConfigRow label={t("config.factoryLayer")} value="SMT #2 Line" />
        <ConfigRow label={t("config.equipmentName")} value={L(node, 'name', 'nameEn')} />
        <ConfigRow label={t("config.equipmentId")} value="UHP9SMT#01RSF#01" />
        <div className="flex items-center justify-between py-1">
          <span className="text-[10px] text-slate-500">{t("config.subDevice")}</span>
          <select className="bg-[var(--c-071526)] border border-[var(--c-1e3a55)] rounded text-[10px] text-slate-300 px-2 py-1 focus:outline-none focus:border-blue-500">
            <option>{t("config.subDeviceFurnaceCavity")}</option>
            <option>{t("config.subDeviceTransportSystem")}</option>
            <option>{t("config.subDeviceControlUnit")}</option>
          </select>
        </div>
      </ConfigSection>

      <ConfigSection title={t("config.iotConfiguration")}>
        <div className="flex items-center justify-between py-1 border-b border-[var(--c-142235)]/60">
          <span className="text-[10px] text-slate-500">{t("config.protocolDriver")}</span>
          {editing ? (
            <select className="bg-[var(--c-071526)] border border-[var(--c-1e3a55)] rounded text-[10px] text-slate-300 px-2 py-1 focus:outline-none focus:border-blue-500">
              <option>{t("config.nodeBasicProtocol")}</option>
              <option>OPC-UA</option>
              <option>MQTT</option>
              <option>HTTP REST</option>
            </select>
          ) : (
            <span className="text-[10px] text-slate-200">{t("config.nodeBasicProtocol")}</span>
          )}
        </div>
        <IoTField
          label={t("config.iotIP")}
          value={isConfigured ? "192.168.1.100" : ""}
          placeholder={t("config.iotPlaceholderIP")}
          editing={editing}
        />
        <IoTField
          label={t("config.port")}
          value={isConfigured ? "502" : ""}
          placeholder={t("config.iotPlaceholderPort")}
          editing={editing}
        />
        <IoTField
          label={t("config.stationNo")}
          value={isConfigured ? "5" : ""}
          placeholder={t("config.iotPlaceholderStation")}
          editing={editing}
        />
        <IoTField
          label={t("config.samplingCycle")}
          value={isConfigured ? "0.5" : ""}
          placeholder={t("config.iotPlaceholderCycle")}
          editing={editing}
        />
        {!isConfigured && (
          <div className="flex items-center gap-1.5 text-[10px] text-amber-400 bg-amber-500/10 rounded p-2 mt-2">
            <WifiOff size={10} /> {t("config.iotNotConfigured")}
          </div>
        )}
      </ConfigSection>

      <ConfigSection title={t("config.dataCollectionPoint")}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[9px] text-slate-500">
            {t("config.pointsDefined", { n: mockDataPoints.length })}
          </span>
          <div className="flex items-center gap-1">
            {[
              { color: "bg-blue-400", label: t("config.add") },
              { color: "bg-amber-400", label: t("config.edit") },
              { color: "bg-red-400", label: t("config.del") },
              { color: "bg-slate-400", label: t("config.import") },
              { color: "bg-emerald-400", label: t("config.export") },
            ].map((btn) => (
              <button
                key={btn.label}
                className={`w-4 h-4 rounded ${btn.color}/20 flex items-center justify-center`}
                title={btn.label}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${btn.color}`} />
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto rounded border border-[var(--c-1e3a55)]">
          <table className="w-full text-[9px]">
            <thead>
              <tr className="bg-[var(--c-071526)] border-b border-[var(--c-1e3a55)]">
                {[
                  t("config.tableName"),
                  t("config.tableVariableAddress"),
                  t("config.tableType"),
                  t("config.tableUnit"),
                  t("config.tableDescription"),
                ].map((h) => (
                  <th
                    key={h}
                    className="text-left px-1.5 py-1.5 text-slate-500 font-medium"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {mockDataPoints.map((dp, i) => (
                <tr
                  key={dp.id}
                  className={`border-b border-[var(--c-142235)] hover:bg-[var(--c-0f2035)] cursor-pointer ${i % 2 === 0 ? "" : "bg-[var(--c-071526)]/50"}`}
                >
                  <td className="px-1.5 py-1 text-slate-300">{dp.name}</td>
                  <td className="px-1.5 py-1 text-blue-400/80 font-mono">
                    {dp.address}
                  </td>
                  <td className="px-1.5 py-1 text-slate-400">{dp.dataType}</td>
                  <td className="px-1.5 py-1 text-slate-500">{dp.unit}</td>
                  <td className="px-1.5 py-1 text-slate-600 max-w-[80px] truncate">
                    {dp.description}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ConfigSection>
    </div>
  );
}

export function EventsPanel({
  editing,
  locked,
}: {
  editing: boolean;
  locked: boolean;
}) {
  const L = useLocalized();
  return (
    <div className="p-3 space-y-3">
      {locked && (
        <div className="flex items-center gap-1.5 p-2 bg-[var(--c-040d18)] border border-[var(--c-1e3a55)] rounded text-[10px] text-slate-500">
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="flex-shrink-0"
          >
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          {t("config.lockMessage")}
        </div>
      )}
      <ConfigSection title={t("config.eventConfiguration")}>
        <p className="text-[10px] text-slate-500">
          {t("config.eventConfigDescription")}
        </p>
        <div className="mt-2 space-y-2">
          {[
            { name: t("config.highTempAlarm"), condition: "heat_zone_1 > 280°C", severity: "Critical" },
            { name: t("config.n2FlowLow"), condition: "n2_flow_avg < 50 L/min", severity: "Warning" },
            { name: t("config.productionComplete"), condition: "rcount increments", severity: "Info" },
          ].map((evt) => (
            <div
              key={evt.name}
              className="bg-[var(--c-071526)] border border-[var(--c-1e3a55)] rounded p-2"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-slate-200 font-medium">
                  {evt.name}
                </span>
                <span
                  className={`text-[9px] px-1.5 py-0.5 rounded ${
                    evt.severity === "Critical"
                      ? "bg-red-500/20 text-red-400"
                      : evt.severity === "Warning"
                        ? "bg-amber-500/20 text-amber-400"
                        : "bg-blue-500/20 text-blue-400"
                  }`}
                >
                  {evt.severity === "Critical"
                    ? t("config.setCritical")
                    : evt.severity === "Warning"
                      ? t("config.setWarning")
                      : t("config.setInfo")}
                </span>
              </div>
              <div className="text-[9px] text-slate-500 font-mono">
                {evt.condition}
              </div>
            </div>
          ))}
          <button className="text-[10px] text-blue-400 hover:text-blue-300 flex items-center gap-1 mt-2">
            <Plus size={10} /> {t("config.addEventRule")}
          </button>
        </div>
      </ConfigSection>
    </div>
  );
}

export function MonitoringPanel({
  editing,
  locked,
}: {
  editing: boolean;
  locked: boolean;
}) {
  const L = useLocalized();
  return (
    <div className="p-3 space-y-3">
      {locked && (
        <div className="flex items-center gap-1.5 p-2 bg-[var(--c-040d18)] border border-[var(--c-1e3a55)] rounded text-[10px] text-slate-500">
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="flex-shrink-0"
          >
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          {t("config.lockMessage")}
        </div>
      )}
      <ConfigSection title={t("config.statusMonitoring")}>
        <p className="text-[10px] text-slate-500 mb-3">
          {t("config.monitoringConfigDescription")}
        </p>
        {[
          { label: t("config.furnaceTempZone1"), min: "200", max: "260", unit: "°C", point: "heat_zone_1" },
          { label: t("config.n2FlowRate"), min: "60", max: "120", unit: "L/min", point: "n2_flow_avg" },
          { label: t("config.productionRate"), min: "800", max: "1500", unit: "pcs/h", point: "heat_ct_nt" },
        ].map((item) => (
          <div
            key={item.label}
            className="bg-[var(--c-071526)] border border-[var(--c-1e3a55)] rounded p-2 mb-2"
          >
            <div className="text-[10px] text-slate-300 font-medium mb-2">
              {item.label}
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <label className="text-[9px] text-slate-500">{t("config.min")}</label>
                <input
                  defaultValue={item.min}
                  className="w-full bg-[var(--c-07111e)] border border-[var(--c-1e3a55)] rounded px-2 py-1 text-[10px] text-slate-300 focus:outline-none focus:border-blue-500 mt-0.5"
                />
              </div>
              <div className="flex-1">
                <label className="text-[9px] text-slate-500">{t("config.max")}</label>
                <input
                  defaultValue={item.max}
                  className="w-full bg-[var(--c-07111e)] border border-[var(--c-1e3a55)] rounded px-2 py-1 text-[10px] text-slate-300 focus:outline-none focus:border-blue-500 mt-0.5"
                />
              </div>
              <div className="text-[10px] text-slate-500 mt-4">{item.unit}</div>
            </div>
            <div className="text-[9px] text-slate-600 mt-1 font-mono">
              {t("config.dataPointLabel")} {item.point}
            </div>
          </div>
        ))}
        <button className="text-[10px] text-blue-400 hover:text-blue-300 flex items-center gap-1 mt-1">
          <Plus size={10} /> {t("config.addMonitoringRule")}
        </button>
      </ConfigSection>
    </div>
  );
}

export function MetricsPanel({
  editing,
  locked,
}: {
  editing: boolean;
  locked: boolean;
}) {
  const L = useLocalized();
  return (
    <div className="p-3 space-y-3">
      {locked && (
        <div className="flex items-center gap-1.5 p-2 bg-[var(--c-040d18)] border border-[var(--c-1e3a55)] rounded text-[10px] text-slate-500">
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="flex-shrink-0"
          >
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          {t("config.lockMessage")}
        </div>
      )}
      <ConfigSection title={t("config.metricsKPI")}>
        <p className="text-[10px] text-slate-500 mb-3">
          {t("config.metricsConfigDescription")}
        </p>
        {[
          { name: t("config.kpiOEE"), formula: "Availability × Performance × Quality", value: "—" },
          { name: t("config.kpiMTBF"), formula: "Total uptime / Number of failures", value: "—" },
          { name: t("config.kpiThroughput"), formula: "rcount / Time interval", value: "—" },
          { name: t("config.kpiTempStability"), formula: "StdDev(heat_zone_1)", value: "—" },
        ].map((m) => (
          <div
            key={m.name}
            className="bg-[var(--c-071526)] border border-[var(--c-1e3a55)] rounded p-2 mb-2"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-slate-200 font-medium">
                {m.name}
              </span>
              <button className="text-slate-500 hover:text-blue-400">
                <Edit2 size={10} />
              </button>
            </div>
            <div className="text-[9px] text-slate-500 font-mono">
              {m.formula}
            </div>
            <div className="text-[9px] text-blue-400 mt-1">
              {t("config.currentValue")} {m.value}
            </div>
          </div>
        ))}
        <button className="text-[10px] text-blue-400 hover:text-blue-300 flex items-center gap-1 mt-1">
          <Plus size={10} /> {t("config.addMetric")}
        </button>
      </ConfigSection>
    </div>
  );
}
