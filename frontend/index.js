import React, { useState } from "react"

import {
  initializeBlock,
  useBase,
  useSynced,
  useGlobalConfig,
  Box,
  Button,
  ConfirmationDialog,
  Heading,
  Text,
  useRecords,
  ViewportConstraint,
  Loader,
  Icon,
  colors,
} from "@airtable/blocks/ui"

import { CONFIG, MAX_FIELDS, MAX_RECORDS_PER_UPDATE } from "./constants"
import Controls from "./controls"
import Preview from "./preview"

const createJoinKeys = (record, fieldIds, caseSensitive, joinOnAll) => {
  const getJoinKeys = (rec) =>
    fieldIds
      .filter((fieldId) => fieldId !== null)
      .map((fieldId) => {
        const val = rec.getCellValueAsString(fieldId)
        return caseSensitive ? val : val.toLowerCase()
      })

  const joinKeys = getJoinKeys(record)
  const validKeys = joinKeys.filter((value) => value.length > 0)
  return joinOnAll ? [joinKeys.join(",")] : validKeys
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
const getFieldsFromTableIds = (table, fieldIds) => {
  const validFields = [...new Set(fieldIds)]
    .map((fieldId) => table.getFieldByIdIfExists(fieldId))
    .filter((field) => !!field)
  return validFields.concat(validFields.length < MAX_FIELDS ? [null] : [])
}

const updateRecords = async (table, recordsToUpdate) => {
  if (table.hasPermissionToUpdateRecords(recordsToUpdate)) {
    let i = 0
    while (i < recordsToUpdate.length) {
      const updateBatch = recordsToUpdate.slice(i, i + MAX_RECORDS_PER_UPDATE)
      await table.updateRecordsAsync(updateBatch)
      i += MAX_RECORDS_PER_UPDATE
    }
  }
}

const onFieldIdsChange = (fieldIds, newFieldId, fieldIdx, setFieldIds) => {
  fieldIds[fieldIdx] = newFieldId
  // Remove null field IDs
  const fieldIdsWithValues = fieldIds.filter((fId) => !!fId)
  setFieldIds([...fieldIdsWithValues])
}

const LinkByFieldsBlock = () => {
  const base = useBase()
  const globalConfig = useGlobalConfig()

  const destTableId = globalConfig.get(CONFIG.DEST_TABLE_ID)
  const destTable = base.getTableByIdIfExists(destTableId)
  const destViewId = globalConfig.get(CONFIG.DEST_VIEW_ID)
  const destView = destTable ? destTable.getViewByIdIfExists(destViewId) : null
  const [destFieldIds, setDestFieldIds, canSetDestFieldIds] = useSynced(
    CONFIG.DEST_FIELD_IDS
  )
  const destFields = destTable
    ? getFieldsFromTableIds(destTable, destFieldIds || [])
    : []
  // Only use valid field IDs, since relying entirely on synced global config
  // state can result in some race conditions
  const validDestFieldIds = destFields
    .filter((field) => !!field)
    .map(({ id }) => id)

  const joinFieldId = globalConfig.get(CONFIG.JOIN_FIELD_ID)
  const joinField = destTable
    ? destTable.getFieldByIdIfExists(joinFieldId)
    : null

  const sourceTable = joinField
    ? base.getTableByIdIfExists(joinField.options.linkedTableId)
    : null
  const [sourceFieldIds, setSourceFieldIds, canSetSourceFieldIds] = useSynced(
    CONFIG.SOURCE_FIELD_IDS
  )
  const sourceFields = sourceTable
    ? getFieldsFromTableIds(sourceTable, sourceFieldIds || [])
    : []
  const validSourceFieldIds = sourceFields
    .filter((field) => !!field)
    .map(({ id }) => id)

  // Is join key matching case-sensitive
  const caseSensitive = globalConfig.get(CONFIG.CASE_SENSITIVE)
  // Whether destination records with values for the join field should be overwritten
  const overwriteExisting = globalConfig.get(CONFIG.OVERWRITE_EXISTING)
  // Whether to join on all keys matching or any
  const joinOnAll = globalConfig.get(CONFIG.JOIN_ON_ALL)
  const [isUpdating, setIsUpdating] = useState(false)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const destTableOrView = destTable || destView
  const destRecords = useRecords(
    destTableOrView ? destTableOrView.selectRecords() : []
  )
  const sourceRecords = useRecords(
    sourceTable ? sourceTable.selectRecords() : []
  )

  // If user doesn't have permissions, show permission reason instead of block
  const configSetPermissions = globalConfig.checkPermissionsForSet()
  if (!configSetPermissions.hasPermission) {
    return (
      <Box
        position="absolute"
        top={0}
        left={0}
        right={0}
        bottom={0}
        display="flex"
        alignItems="center"
        justifyContent="center"
      >
        <Text textColor="light" fontWeight="500">
          {configSetPermissions.reasonDisplayString}
        </Text>
      </Box>
    )
  }

  const sourceKeyMap =
    sourceTable &&
    (validSourceFieldIds || []).every((fieldId) =>
      sourceTable.getFieldByIdIfExists(fieldId)
    ) &&
    (validSourceFieldIds || []).length > 0
      ? createJoinKeyMap(
          sourceRecords,
          validSourceFieldIds,
          caseSensitive,
          joinOnAll
        )
      : {}

  const recordsToLink =
    destRecords &&
    joinFieldId &&
    [joinFieldId, ...validDestFieldIds].every((fieldId) =>
      destTable.getFieldByIdIfExists(fieldId)
    )
      ? destRecords
      : []

  const recordLinks = recordsToLink
    .map((record) => {
      if (
        joinFieldId &&
        (record.getCellValue(joinFieldId) || []).length > 0 &&
        !overwriteExisting
      ) {
        return { record, match: null }
      }
      const joinKeys = createJoinKeys(
        record,
        validDestFieldIds || [],
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

  let bottomBarText = ``
  if (!destTable) {
    bottomBarText = `Pick a table to enable update options`
  } else if (!sourceTable) {
    bottomBarText = `Pick a linked record field to enable match options`
  } else if (isUpdating) {
    bottomBarText = `Updating records...`
  } else if (updateButtonIsDisabled) {
    bottomBarText = `Pick fields to match on to link records`
  }

  let previewHeaderText = `Pick a table, linked record field, and matching fields to update linked records based on matching field values`
  if (joinField) {
    previewHeaderText = isUpdating
      ? `Updating records...`
      : `The ${
          joinField.name
        } field of ${recordLinks.length.toLocaleString()} ${
          recordLinks.length === 1 ? `record` : `records`
        } in the ${destTable.name} table will be updated`
  }

  return (
    <ViewportConstraint minSize={{ width: 600, height: 400 }}>
      <Box
        position="absolute"
        top={0}
        left={0}
        right={0}
        bottom={0}
        display="flex"
        flexDirection="column"
      >
        <Box flex="auto" display="flex" flexDirection="row">
          <Controls
            destTable={destTable}
            destFields={destFields}
            onChangeDestFields={(newField, idx) => {
              onFieldIdsChange(
                validDestFieldIds || [],
                newField ? newField.id : null,
                idx,
                setDestFieldIds
              )
            }}
            canSetDestFieldIds={canSetDestFieldIds}
            sourceTable={sourceTable}
            sourceFields={sourceFields}
            onChangeSourceFields={(newField, idx) => {
              onFieldIdsChange(
                validSourceFieldIds || [],
                newField ? newField.id : null,
                idx,
                setSourceFieldIds
              )
            }}
            canSetSourceFieldIds={canSetSourceFieldIds}
          />
          <Box
            height="100%"
            width="100%"
            padding={3}
            borderLeft="thick"
            display="flex"
            flexDirection="column"
          >
            <Box borderBottom="thick" flexGrow="0">
              <Heading>Link records by fields</Heading>
              <Text variant="paragraph">{previewHeaderText}</Text>
            </Box>
            {recordLinks.length > 0 ? (
              <Preview
                recordLinks={recordLinks}
                destFields={destFields}
                joinField={joinField}
                overwriteExisting={overwriteExisting}
              />
            ) : (
              <Box
                width="100%"
                display="flex"
                alignItems="center"
                justifyContent="center"
                flexGrow="1"
              >
                <Heading textColor="light">No records to update</Heading>
              </Box>
            )}
          </Box>
        </Box>
        <Box
          flex="none"
          display="flex"
          flexDirection="row"
          alignItems="center"
          justifyContent="space-between"
          borderTop="thick"
          padding={3}
          paddingTop={3}
          paddingBottom={3}
        >
          <Box display="flex" flexDirection="row" alignItems="center">
            {updateButtonIsDisabled && !isUpdating && (
              <Icon
                name="warning"
                size={16}
                marginRight={2}
                fillColor={colors.ORANGE}
              />
            )}
            {isUpdating && <Loader scale={0.3} marginRight={2} />}
            <Text textColor="light">{bottomBarText}</Text>
          </Box>
          <Button
            disabled={updateButtonIsDisabled}
            variant="primary"
            onClick={async () => setIsDialogOpen(true)}
          >
            Link records
          </Button>
          {isDialogOpen && (
            <ConfirmationDialog
              title="Are you sure?"
              body={`This will update ${recordLinks.length} records`}
              onConfirm={() => {
                setIsUpdating(true)
                updateRecords(
                  destTable,
                  recordLinks.map(({ record: { id }, match }) => ({
                    id,
                    fields: { [joinFieldId]: [{ id: match.id }] },
                  }))
                ).then(() => setIsUpdating(false))
                setIsDialogOpen(false)
              }}
              onCancel={() => setIsDialogOpen(false)}
              isConfirmActionDangerous
            />
          )}
        </Box>
      </Box>
    </ViewportConstraint>
  )
}

initializeBlock(() => <LinkByFieldsBlock />)
