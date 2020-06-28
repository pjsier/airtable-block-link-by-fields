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
  const destFields = getFieldsFromTableIds(destTable, destFieldIds || [])

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
  const sourceFields = getFieldsFromTableIds(sourceTable, sourceFieldIds || [])

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
      <Box padding={2} display="flex" flexDirection="row" borderBottom="thick">
        <Box padding={1}>
          <Heading>{`Records to join`}</Heading>
          <Text style={{ marginBottom: "12px" }}>
            {`Select records that need to be joined to a source. i.e. event sign-ups that need to be linked to members by email`}
          </Text>
          <Box display="flex" flexDirection="row">
            <Box padding={1}>
              <FormField label="Table to be updated">
                <TablePickerSynced
                  globalConfigKey={"destTableId"}
                  width="320px"
                />
              </FormField>
            </Box>
            <FormField label="Table view to pull records from (optional)">
              <ViewPickerSynced
                table={null}
                globalConfigKey={"destViewId"}
                size="small"
                width="320px"
              />
            </FormField>
          </Box>
          <Box display="flex" flexDirection="row">
            <Box padding={1}>
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
            <Box display="flex" flexDirection="column">
              {destFields.map((field, idx) => (
                <Box key={idx} padding={1}>
                  <FormField label="Fields to join based on">
                    <FieldPicker
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
                    />
                  </FormField>
                </Box>
              ))}
            </Box>
          </Box>
        </Box>
        <Box padding={1}>
          <Heading>{`Source records for join`}</Heading>
          <Text style={{ marginBottom: "12px" }}>
            {`Source table and fields for records that need to be updated in the selected field of "Records to join"`}
          </Text>
          {sourceTable ? (
            <>
              {sourceFields.map((field, idx) => (
                <FormField label="Fields to join based on" key={idx}>
                  <FieldPicker
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
                  />
                </FormField>
              ))}
            </>
          ) : (
            <Text>
              {`Select a source record field in "Records to join" to enable options`}
            </Text>
          )}
        </Box>
      </Box>
      <Box padding={2} display="flex" flexDirection="row">
        <Box padding={1}>
          <Heading>{`Settings`}</Heading>
          <Text style={{ marginBottom: "12px" }}>{`Join configuration`}</Text>
          <FormField label="Is join case-sensitive?">
            <SwitchSynced
              globalConfigKey={"caseSensitive"}
              label="Case-sensitive"
            />
          </FormField>
          <FormField
            label="Should join require all keys?"
            description="By default it will match if any key matches"
          >
            <SwitchSynced
              globalConfigKey={"joinOnAll"}
              label="Join on all keys"
            />
          </FormField>
          <FormField
            label="Overwrite existing"
            description="Should records with existing matches be overwritten with new matches?"
          >
            <SwitchSynced
              globalConfigKey={"overwriteExisting"}
              label="Overwrite existing"
            />
          </FormField>
        </Box>
        <Box padding={1}>
          <Button
            disabled={updateButtonIsDisabled}
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
