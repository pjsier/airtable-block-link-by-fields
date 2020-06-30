import {
  initializeBlock,
  useBase,
  useSynced,
  useGlobalConfig,
  FieldPicker,
  FieldPickerSynced,
  TablePickerSynced,
  ViewPickerSynced,
  SwitchSynced,
  Box,
  Button,
  ConfirmationDialog,
  Heading,
  FormField,
  Text,
  Icon,
  useRecords,
  CellRenderer,
  colors,
} from "@airtable/blocks/ui"
import { FieldType } from "@airtable/blocks/models"
import React, { useState } from "react"
import { FixedSizeList as List } from "react-window"
import AutoSizer from "react-virtualized-auto-sizer"

const MAX_FIELDS = 3
const MAX_RECORDS_PER_UPDATE = 50
const PADDING = 4
const ROW_HEIGHT = 100

const createJoinKeys = (record, fieldIds, caseSensitive, joinOnAll) => {
  const getValidJoinKeys = (rec) =>
    fieldIds
      .filter((fieldId) => fieldId !== null)
      .map((fieldId) => {
        const val = rec.getCellValueAsString(fieldId)
        return caseSensitive ? val : val.toLowerCase()
      })
      .filter((val) => val.length > 0)

  const validKeys = getValidJoinKeys(record)
  return joinOnAll ? [validKeys.join(",")] : validKeys
}

// Create a mapping of join key values to record IDs
const createJoinKeyMap = (records, fieldIds, caseSensitive, joinOnAll) =>
  records
    .map((record) =>
      createJoinKeys(record, fieldIds, caseSensitive, joinOnAll).map((key) => ({
        key,
        record,
      }))
    )
    .flat()
    .filter(({ key }) => key.length > 0)
    .reduce(
      (obj, { record, key }) => ({
        ...obj,
        [key]: record,
      }),
      {}
    )

// Load fields from table by array of IDs, add null at the end if not at max
const getFieldsFromTableIds = (table, fieldIds) => [
  ...[...new Set(fieldIds)].map((fieldId) =>
    table.getFieldByIdIfExists(fieldId)
  ),
  ...(new Set(fieldIds).size < MAX_FIELDS ? [null] : []),
]

const updateRecords = async (table, recordsToUpdate) => {
  if (table.hasPermissionToUpdateRecords(recordsToUpdate)) {
    let i = 0
    while (i < recordsToUpdate.length) {
      const updateBatch = recordsToUpdate.slice(i, i + MAX_RECORDS_PER_UPDATE)
      await table.updateRecordsAsync(updateBatch)
      i += MAX_RECORDS_PER_UPDATE
    }
  }

  alert("Records have been updated")
}

const onFieldIdsChange = (fieldIds, newFieldId, fieldIdx, setFieldIds) => {
  fieldIds[fieldIdx] = newFieldId
  // Remove null field IDs
  const fieldIdsWithValues = fieldIds.filter((fId) => !!fId)
  setFieldIds([...fieldIdsWithValues])
}

// TODO: Add hover state over label for changed field indicating change
const FieldLabel = ({ name }) => (
  <Box
    fontSize="11px"
    lineHeight="13px"
    textColor="#898989"
    style={{
      textTransform: "uppercase",
      maxWidth: "100%",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    }}
  >
    {name}
  </Box>
)

const JoinRecordsBlock = () => {
  const base = useBase()
  const globalConfig = useGlobalConfig()

  const destTableId = globalConfig.get("destTableId")
  const destTable = base.getTableByIdIfExists(destTableId)
  const destViewId = globalConfig.get("destViewId")
  const destView = destTable ? destTable.getViewByIdIfExists(destViewId) : null
  const [destFieldIds, setDestFieldIds, canSetDestFieldIds] = useSynced(
    "destFieldIds"
  )
  const destFields = destTable
    ? getFieldsFromTableIds(destTable, destFieldIds || [])
    : []

  const joinFieldId = globalConfig.get("joinFieldId")
  const joinField = destTable
    ? destTable.getFieldByIdIfExists(joinFieldId)
    : null

  const sourceTable = joinField
    ? base.getTableByIdIfExists(joinField.options.linkedTableId)
    : null
  const [sourceFieldIds, setSourceFieldIds, canSetSourceFieldIds] = useSynced(
    "sourceFieldIds"
  )
  const sourceFields = sourceTable
    ? getFieldsFromTableIds(sourceTable, sourceFieldIds || [])
    : []

  // Is join key matching case-sensitive
  const caseSensitive = globalConfig.get("caseSensitive")
  // Whether destination records with values for the join field should be overwritten
  const overwriteExisting = globalConfig.get("overwriteExisting")
  // Whether to join on all keys matching or any
  const joinOnAll = globalConfig.get("joinOnAll")
  const [isUpdating, setIsUpdating] = useState(false)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const destTableOrView = destTable || destView
  const destRecords = useRecords(
    destTableOrView ? destTableOrView.selectRecords() : []
  )
  const sourceRecords = useRecords(
    sourceTable ? sourceTable.selectRecords() : []
  )

  const sourceKeyMap =
    sourceTable && sourceFieldIds.length > 0
      ? createJoinKeyMap(
          sourceRecords,
          sourceFieldIds,
          caseSensitive,
          joinOnAll
        )
      : {}

  const recordLinks = destRecords
    .map((record) => {
      if (
        (record.getCellValue(joinFieldId) || []).length > 0 &&
        !overwriteExisting
      ) {
        return { record, match: null }
      }
      const joinKeys = createJoinKeys(
        record,
        destFieldIds,
        caseSensitive,
        joinOnAll
      )
      for (let k of joinKeys) {
        if (k in sourceKeyMap) {
          return { record, match: sourceKeyMap[k] }
        }
      }
      return { record, match: null }
    })
    .filter(({ match }) => match !== null)

  const updateButtonIsDisabled =
    !(
      destFields.filter((f) => f !== null).length > 0 &&
      sourceFields.filter((f) => f !== null).length > 0
    ) || isUpdating

  return (
    <Box
      position="absolute"
      top={0}
      left={0}
      right={0}
      bottom={0}
      padding={2}
      display="flex"
      flexDirection="row"
    >
      <Box>
        <Box
          padding={2}
          display="flex"
          flexDirection="column"
          style={{ width: "100%" }}
        >
          <Box padding={1}>
            <Heading>{`Link records by fields`}</Heading>
            <Text style={{ marginBottom: "12px" }}>
              {`Select records where linked fields should be updated by matching field values.`}
            </Text>
          </Box>
          <Box display="flex" flexDirection="row">
            <Box padding={1} style={{ flexGrow: "1" }}>
              <FormField label="Table to be updated">
                <TablePickerSynced
                  globalConfigKey={"destTableId"}
                  width="320px"
                />
              </FormField>
              <FormField label="Table view to pull records from">
                <ViewPickerSynced
                  table={destTable}
                  globalConfigKey={"destViewId"}
                  shouldAllowPickingNone
                  size="small"
                  width="320px"
                />
              </FormField>
            </Box>
            <Box padding={1} style={{ flexGrow: "1" }}>
              <FormField label="Linked field to update">
                <FieldPickerSynced
                  table={destTable}
                  allowedTypes={[FieldType.MULTIPLE_RECORD_LINKS]}
                  globalConfigKey={"joinFieldId"}
                  size="small"
                  width="320px"
                />
              </FormField>
            </Box>
          </Box>
          <Box display="flex" flexDirection="row">
            <Box padding={1} style={{ flexGrow: "1", width: "50%" }}>
              <FormField label="Fields for link">
                {destFields.map((field, idx) => (
                  <FieldPicker
                    key={idx}
                    table={destTable}
                    field={field}
                    onChange={(newField) =>
                      onFieldIdsChange(
                        destFieldIds || [],
                        newField ? newField.id : null,
                        idx,
                        setDestFieldIds
                      )
                    }
                    disabled={!canSetDestFieldIds}
                    shouldAllowPickingNone
                    size="small"
                    width="320px"
                    style={{ marginBottom: "4px" }}
                  />
                ))}
              </FormField>
            </Box>
            <Box padding={1} style={{ flexGrow: "1", width: "50%" }}>
              <FormField label="Fields for link">
                {sourceTable ? (
                  sourceFields.map((field, idx) => (
                    <FieldPicker
                      key={idx}
                      table={sourceTable}
                      field={field}
                      onChange={(newField) =>
                        onFieldIdsChange(
                          sourceFieldIds || [],
                          newField ? newField.id : null,
                          idx,
                          setSourceFieldIds
                        )
                      }
                      disabled={!canSetSourceFieldIds}
                      shouldAllowPickingNone
                      size="small"
                      width="320px"
                      style={{ marginBottom: "4px" }}
                    />
                  ))
                ) : (
                  <Text>
                    {`Select a source record field in "Records to join" to enable options`}
                  </Text>
                )}
              </FormField>
            </Box>
          </Box>
        </Box>
        <Box padding={2}>
          <Box padding={1} style={{ width: "50%", flexGrow: "1" }}>
            <FormField label="" style={{ marginBottom: "2px" }}>
              <SwitchSynced
                globalConfigKey={"caseSensitive"}
                label="Case-sensitive"
              />
            </FormField>
            <FormField label="" style={{ marginBottom: "2px" }}>
              <SwitchSynced
                globalConfigKey={"joinOnAll"}
                label="Only update record when all fields match"
              />
            </FormField>
            <FormField label="" style={{ marginBottom: "2px" }}>
              <SwitchSynced
                globalConfigKey={"overwriteExisting"}
                label="Overwrite existing linked records with new matches"
              />
            </FormField>
            <Button
              disabled={updateButtonIsDisabled}
              variant="primary"
              onClick={async () => setIsDialogOpen(true)}
              style={{ marginTop: `${PADDING * 3}px` }}
            >
              {`Link records`}
            </Button>
          </Box>
        </Box>
        {isDialogOpen && (
          <ConfirmationDialog
            title="Are you sure?"
            body={
              isUpdating
                ? `Updating records...`
                : `This will update ${recordLinks.length} records`
            }
            onConfirm={() => {
              setIsUpdating(true)
              updateRecords(
                destTable,
                recordLinks.map(({ record: { id }, match }) => ({
                  id,
                  fields: { [joinFieldId]: [{ id: match.id }] },
                }))
              )
              setIsDialogOpen(false)
              setIsUpdating(false)
            }}
            onCancel={() => setIsDialogOpen(false)}
            isConfirmActionDangerous
          />
        )}
      </Box>
      <Box height="100%" width="100%" padding={2} style={{ maxHeight: "100%" }}>
        <Box>
          <Heading>{`Records to update`}</Heading>
          <Text style={{ marginBottom: "12px" }}>
            {`${recordLinks.length.toLocaleString()} record links will be updated`}
          </Text>
        </Box>
        <AutoSizer>
          {({ height, width }) => (
            <List
              width={width}
              height={height}
              itemCount={recordLinks.length}
              itemSize={ROW_HEIGHT}
            >
              {({ index, style }) => {
                const { record, match } = recordLinks[index]
                return (
                  <Box
                    key={record.id}
                    display="flex"
                    flexDirection="row"
                    alignItems="center"
                    style={style}
                    borderBottom="thick"
                  >
                    <Box
                      display="flex"
                      flexDirection="column"
                      style={{ maxWidth: "100%" }}
                    >
                      {/* TODO: Fix padding on overflow */}
                      <Box
                        fontSize="14px"
                        height="18px"
                        lineHeight={1.5}
                        display="flex"
                        alignItems="center"
                        marginBottom={`${PADDING * 3}px`}
                      >
                        {record.name}
                      </Box>
                      <Box
                        display="flex"
                        flexDirection="row"
                        alignItems="center"
                        style={{
                          maxWidth: "100%",
                          overflowX: "scroll",
                          overflowY: "hidden",
                        }}
                      >
                        <Box>
                          <FieldLabel name={joinField.name} />
                          <Box
                            display="flex"
                            flexDirection="row"
                            alignItems="center"
                          >
                            <Icon name="plus" fillColor={colors.GREEN} />
                            <CellRenderer
                              field={joinField}
                              cellValue={[{ id: match.id, name: match.name }]}
                            />
                          </Box>
                        </Box>
                        {destFields
                          .filter((field) => field !== null)
                          .map((field) => (
                            <Box key={field.id}>
                              <FieldLabel name={field.name} />
                              <CellRenderer field={field} record={record} />
                            </Box>
                          ))}
                      </Box>
                    </Box>
                  </Box>
                )
              }}
            </List>
          )}
        </AutoSizer>
      </Box>
    </Box>
  )
}

initializeBlock(() => <JoinRecordsBlock />)
