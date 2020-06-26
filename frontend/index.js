import {
  initializeBlock,
  useBase,
  useSynced,
  useGlobalConfig,
  useState,
  FieldPicker,
  FieldPickerSynced,
  TablePickerSynced,
  ViewPickerSynced,
  SwitchSynced,
  Box,
  Button,
  ConfirmationDialog,
  FormField,
  Text,
} from "@airtable/blocks/ui"
import { FieldType } from "@airtable/blocks/models"
import React from "react"

const MAX_FIELDS = 3
const MAX_RECORDS_PER_UPDATE = 50

// Create a mapping of join key values to record IDs
const createJoinKeyMap = (records, fieldIds, caseInsensitive, joinOnAll) => {
  const getValidJoinKeys = (rec) =>
    fieldIds
      .filter((fieldId) => fieldId !== null)
      .map((fieldId) => {
        const val = rec.getCellValueAsString(fieldId)
        return caseInsensitive ? val.toLowerCase() : val
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

const updateRecords = async (table, recordsToUpdate) => {
  if (table.hasPermissionToUpdateRecords(recordsToUpdate)) {
    let i = 0
    while (i < updateRecords.length) {
      const updateBatch = updateRecords.slice(i, i + MAX_RECORDS_PER_UPDATE)
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
  // Add a null field ID if there is remaining space so more fields can be entered
  const nextValue = fieldIdsWithValues.length === MAX_FIELDS ? [] : [null]
  setFieldIds([...fieldIdsWithValues, ...nextValue])
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

  const caseInsensitive = globalConfig.get("caseInsensitive")
  const overwriteExisting = globalConfig.get("overwriteExisting")
  // Whether to join on all keys matching or any
  const joinOnAll = globalConfig.get("joinOnAll")
  const [recordsToUpdate, setRecordsToUpdate] = useState([])
  const [isUpdating, setIsUpdating] = useState(false)
  const [isDialogOpen, setIsDialogOpen] = useState(false)

  const selectRecordsToUpdate = () => {
    // Pull records to be updated
    const destRecords = (destView
      ? destView.selectRecords()
      : destTable.selectRecords()
    ).filter((rec) => {
      if (overwriteExisting) return true
      // If not overwriting existing, only pull records where the join field is empty
      return rec.getCellValue(joinFieldId).length === 0
    })
    const destKeyMap = createJoinKeyMap(
      destRecords,
      destFieldIds,
      caseInsensitive,
      joinOnAll
    )
    const sourceRecords = sourceTable.selectRecords()
    const sourceKeyMap = createJoinKeyMap(
      sourceRecords,
      sourceFieldIds,
      caseInsensitive,
      joinOnAll
    )
    return Object.entries(destKeyMap)
      .map(([key, id]) =>
        key in sourceKeyMap ? { id, key, joinId: sourceKeyMap[key] } : null
      )
      .filter((match) => match !== null)
      .map(({ id, joinId }) => ({
        id,
        fields: { [joinFieldId]: [joinId] },
      }))
  }

  const updateButtonIsDisabled =
    !(
      destTable &&
      destFieldIds.filter((f) => f !== null).length > 0 &&
      sourceTable &&
      sourceFieldIds.filter((f) => f !== null).length > 0
    ) || isUpdating

  return (
    <Box
      position="absolute"
      top={0}
      left={0}
      right={0}
      bottom={0}
      display="flex"
      flexDirection="column"
    >
      <Box display="flex" padding={3} borderBottom="thick">
        <Box>
          <FormField>
            <TablePickerSynced globalConfigKey={"destTableId"} width="320px" />
          </FormField>
          {destTable && (
            <>
              <FormField>
                <ViewPickerSynced
                  table={destTable}
                  globalConfigKey={"destViewId"}
                  size="small"
                  width="320px"
                />
              </FormField>
              <FormField>
                <FieldPickerSynced
                  table={destTable}
                  allowedTypes={[FieldType.MULTIPLE_RECORD_LINKS]}
                  globalConfigKey={"joinFieldId"}
                  size="small"
                  width="320px"
                />
              </FormField>
              {(destFieldIds || [null]).map((fieldId, idx) => (
                <FormField key={idx}>
                  <FieldPicker
                    table={destTable}
                    value={fieldId}
                    onChange={(newFieldId) =>
                      onFieldIdsChange(
                        destFieldIds,
                        newFieldId,
                        idx,
                        setDestFieldIds
                      )
                    }
                    disabled={!canSetDestFieldIds}
                    size="small"
                    width="320px"
                  />
                </FormField>
              ))}
            </>
          )}
          <FormField>
            <SwitchSynced
              globalConfigKey={"isCaseInsensitive"}
              label="Is join lookup case-sensitive?"
            />
          </FormField>
          <FormField>
            <SwitchSynced
              globalConfigKey={"joinOnAll"}
              label="Should records only join if all keys match? Default is matching any key"
            />
          </FormField>
          <Button
            disabled={updateButtonIsDisabled}
            onClick={() => {
              setIsUpdating(true, () => {
                setRecordsToUpdate(selectRecordsToUpdate(), () => {
                  setIsDialogOpen(true)
                  setIsUpdating(false)
                })
              })
            }}
          >
            {isUpdating ? `Update records` : `Preparing update...`}
          </Button>
        </Box>
        <Box>
          {sourceTable ? (
            <>
              {(sourceFieldIds || [null]).map((fieldId, idx) => (
                <FormField key={idx}>
                  <FieldPicker
                    table={sourceTable}
                    value={fieldId}
                    onChange={(newFieldId) =>
                      onFieldIdsChange(
                        sourceFieldIds,
                        newFieldId,
                        idx,
                        setSourceFieldIds
                      )
                    }
                    disabled={!canSetSourceFieldIds}
                    size="small"
                    width="320px"
                  />
                </FormField>
              ))}
            </>
          ) : (
            <Text>
              {`Select a source field to set the destination field join keys`}
            </Text>
          )}
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
              setIsUpdating(true, () => {
                updateRecords(destTable, recordsToUpdate)
                setIsDialogOpen(false)
                setIsUpdating(false)
              })
            }}
            onCancel={() => setIsDialogOpen(false)}
            isConfirmActionDangerous
          />
        )}
      </Box>
    </Box>
  )
}

initializeBlock(() => <JoinRecordsBlock />)
