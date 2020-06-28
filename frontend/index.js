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
} from "@airtable/blocks/ui"
import { FieldType } from "@airtable/blocks/models"
import React, { useState } from "react"

const MAX_FIELDS = 3
const MAX_RECORDS_PER_UPDATE = 50

// Create a mapping of join key values to record IDs
const createJoinKeyMap = (records, fieldIds, caseSensitive, joinOnAll) => {
  const getValidJoinKeys = (rec) =>
    fieldIds
      .filter((fieldId) => fieldId !== null)
      .map((fieldId) => {
        const val = rec.getCellValueAsString(fieldId)
        return caseSensitive ? val : val.toLowerCase()
      })
      .filter((val) => val.length > 0)

  const createJoinKeys = (rec) => {
    const validKeys = getValidJoinKeys(rec)
    return joinOnAll ? [validKeys.join(",")] : validKeys
  }

  // Only match records with values for keys
  return records
    .map((rec) => createJoinKeys(rec).map((key) => ({ id: rec.id, key })))
    .flat()
    .filter(({ key }) => key.length > 0)
    .reduce(
      (obj, { id, key }) => ({
        ...obj,
        [key]: id,
      }),
      {}
    )
}

const findRecordsToUpdate = async (destKeyMap, sourceKeyMap, joinFieldId) =>
  Object.entries(destKeyMap)
    .map(([key, id]) =>
      key in sourceKeyMap ? { id, key, joinId: sourceKeyMap[key] } : null
    )
    .filter((match) => match !== null)
    .map(({ id, joinId }) => ({
      id,
      fields: { [joinFieldId]: [{ id: joinId }] },
    }))

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
  const [recordsToUpdate, setRecordsToUpdate] = useState([])
  const [isPreparing, setIsPreparing] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)
  const [isDialogOpen, setIsDialogOpen] = useState(false)

  const selectRecordsToUpdate = async () => {
    // Pull records to be updated
    const { records: loadedRecords } = await (
      destView || destTable
    ).selectRecordsAsync()
    const destRecords = loadedRecords.filter((rec) => {
      if (overwriteExisting) return true
      // If not overwriting existing, only pull records where the join field is empty
      return (rec.getCellValue(joinFieldId) || []).length === 0
    })
    const { records: sourceRecords } = await sourceTable.selectRecordsAsync()

    const destKeyMap = createJoinKeyMap(
      destRecords,
      destFieldIds,
      caseSensitive,
      joinOnAll
    )
    const sourceKeyMap = createJoinKeyMap(
      sourceRecords,
      sourceFieldIds,
      caseSensitive,
      joinOnAll
    )
    return findRecordsToUpdate(destKeyMap, sourceKeyMap, joinFieldId)
  }

  const updateButtonIsDisabled =
    !(
      destFields.filter((f) => f !== null).length > 0 &&
      sourceFields.filter((f) => f !== null).length > 0
    ) ||
    isPreparing ||
    isUpdating

  return (
    <Box
      position="absolute"
      top={0}
      left={0}
      right={0}
      bottom={0}
      padding={2}
      display="flex"
      flexDirection="column"
    >
      <Box
        padding={2}
        display="flex"
        flexDirection="column"
        borderBottom="thick"
        style={{ width: "100%" }}
      >
        <Box padding={1}>
          <Heading>{`Records to join`}</Heading>
          <Text style={{ marginBottom: "12px" }}>
            {`Select records that need to be joined to a source. i.e. event sign-ups that need to be linked to members by email`}
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
            <FormField label="Table view to pull records from (optional)">
              <ViewPickerSynced
                table={destTable}
                shouldAllowPickingNone
                globalConfigKey={"destViewId"}
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
            <FormField label="Fields to join based on">
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
            <FormField label="Fields to join based on">
              {sourceTable ? (
                sourceFields.map((field, idx) => (
                  <FieldPicker
                    key={idx}
                    table={sourceTable}
                    field={field}
                    onChange={(newField) =>
                      onFieldIdsChange(
                        destFieldIds || [],
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
          <FormField label="">
            <SwitchSynced
              globalConfigKey={"caseSensitive"}
              label="Case-sensitive"
            />
          </FormField>
          <FormField label="">
            <SwitchSynced
              globalConfigKey={"joinOnAll"}
              label="Only update record when all fields match"
            />
          </FormField>
          <FormField label="">
            <SwitchSynced
              globalConfigKey={"overwriteExisting"}
              label="Overwrite existing linked records with new matches"
            />
          </FormField>
          <Button
            disabled={updateButtonIsDisabled}
            variant="primary"
            onClick={async () => {
              setIsPreparing(true)
              setRecordsToUpdate(await selectRecordsToUpdate())
              setIsDialogOpen(true)
              setIsPreparing(false)
            }}
          >
            {isPreparing ? `Preparing update...` : `Update records`}
          </Button>
        </Box>
      </Box>
      {isDialogOpen && (
        <ConfirmationDialog
          title="Are you sure?"
          body={
            isUpdating
              ? `Updating records...`
              : `This will update ${recordsToUpdate.length} records`
          }
          onConfirm={() => {
            setIsUpdating(true)
            updateRecords(destTable, recordsToUpdate)
            setIsDialogOpen(false)
            setIsUpdating(false)
          }}
          onCancel={() => setIsDialogOpen(false)}
          isConfirmActionDangerous
        />
      )}
    </Box>
  )
}

initializeBlock(() => <JoinRecordsBlock />)
