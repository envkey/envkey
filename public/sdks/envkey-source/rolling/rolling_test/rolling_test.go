package rolling_test

import (
	"testing"

	"github.com/envkey/envkey/public/sdks/envkey-source/rolling"
	"github.com/stretchr/testify/assert"
)

func TestBatchInfo(t *testing.T) {
	var batchNum, totalBatches uint16
	var err error

	batchNum, totalBatches, err = rolling.BatchInfo("0|1", 25)
	assert.Nil(t, err)
	assert.Equal(t, uint16(0), batchNum)
	assert.Equal(t, uint16(1), totalBatches)

	batchNum, totalBatches, err = rolling.BatchInfo("0|2", 25)
	assert.Nil(t, err)
	assert.Equal(t, uint16(0), batchNum)
	assert.Equal(t, uint16(2), totalBatches)

	batchNum, totalBatches, err = rolling.BatchInfo("1|2", 25)
	assert.Nil(t, err)
	assert.Equal(t, uint16(1), batchNum)
	assert.Equal(t, uint16(2), totalBatches)

	batchNum, totalBatches, err = rolling.BatchInfo("0|3", 25)
	assert.Nil(t, err)
	assert.Equal(t, uint16(0), batchNum)
	assert.Equal(t, uint16(3), totalBatches)

	batchNum, totalBatches, err = rolling.BatchInfo("1|3", 25)
	assert.Nil(t, err)
	assert.Equal(t, uint16(1), batchNum)
	assert.Equal(t, uint16(3), totalBatches)

	batchNum, totalBatches, err = rolling.BatchInfo("2|3", 25)
	assert.Nil(t, err)
	assert.Equal(t, uint16(2), batchNum)
	assert.Equal(t, uint16(3), totalBatches)

	batchNum, totalBatches, err = rolling.BatchInfo("0|4", 25)
	assert.Nil(t, err)
	assert.Equal(t, uint16(0), batchNum)
	assert.Equal(t, uint16(4), totalBatches)

	batchNum, totalBatches, err = rolling.BatchInfo("1|4", 25)
	assert.Nil(t, err)
	assert.Equal(t, uint16(1), batchNum)
	assert.Equal(t, uint16(4), totalBatches)

	batchNum, totalBatches, err = rolling.BatchInfo("2|4", 25)
	assert.Nil(t, err)
	assert.Equal(t, uint16(2), batchNum)
	assert.Equal(t, uint16(4), totalBatches)

	batchNum, totalBatches, err = rolling.BatchInfo("3|4", 25)
	assert.Nil(t, err)
	assert.Equal(t, uint16(3), batchNum)
	assert.Equal(t, uint16(4), totalBatches)

	batchNum, totalBatches, err = rolling.BatchInfo("0|5", 25)
	assert.Nil(t, err)
	assert.Equal(t, uint16(0), batchNum)
	assert.Equal(t, uint16(4), totalBatches)

	batchNum, totalBatches, err = rolling.BatchInfo("1|5", 25)
	assert.Nil(t, err)
	assert.Equal(t, uint16(0), batchNum)
	assert.Equal(t, uint16(4), totalBatches)

	batchNum, totalBatches, err = rolling.BatchInfo("2|5", 25)
	assert.Nil(t, err)
	assert.Equal(t, uint16(1), batchNum)
	assert.Equal(t, uint16(4), totalBatches)

	batchNum, totalBatches, err = rolling.BatchInfo("3|5", 25)
	assert.Nil(t, err)
	assert.Equal(t, uint16(2), batchNum)
	assert.Equal(t, uint16(4), totalBatches)

	batchNum, totalBatches, err = rolling.BatchInfo("4|5", 25)
	assert.Nil(t, err)
	assert.Equal(t, uint16(3), batchNum)
	assert.Equal(t, uint16(4), totalBatches)

	batchNum, totalBatches, err = rolling.BatchInfo("0|6", 25)
	assert.Nil(t, err)
	assert.Equal(t, uint16(0), batchNum)
	assert.Equal(t, uint16(4), totalBatches)

	batchNum, totalBatches, err = rolling.BatchInfo("1|6", 25)
	assert.Nil(t, err)
	assert.Equal(t, uint16(0), batchNum)
	assert.Equal(t, uint16(4), totalBatches)

	batchNum, totalBatches, err = rolling.BatchInfo("2|6", 25)
	assert.Nil(t, err)
	assert.Equal(t, uint16(1), batchNum)
	assert.Equal(t, uint16(4), totalBatches)

	batchNum, totalBatches, err = rolling.BatchInfo("3|6", 25)
	assert.Nil(t, err)
	assert.Equal(t, uint16(1), batchNum)
	assert.Equal(t, uint16(4), totalBatches)

	batchNum, totalBatches, err = rolling.BatchInfo("4|6", 25)
	assert.Nil(t, err)
	assert.Equal(t, uint16(2), batchNum)
	assert.Equal(t, uint16(4), totalBatches)

	batchNum, totalBatches, err = rolling.BatchInfo("5|6", 25)
	assert.Nil(t, err)
	assert.Equal(t, uint16(3), batchNum)
	assert.Equal(t, uint16(4), totalBatches)

	batchNum, totalBatches, err = rolling.BatchInfo("0|8", 25)
	assert.Nil(t, err)
	assert.Equal(t, uint16(0), batchNum)
	assert.Equal(t, uint16(4), totalBatches)

	batchNum, totalBatches, err = rolling.BatchInfo("1|8", 25)
	assert.Nil(t, err)
	assert.Equal(t, uint16(0), batchNum)
	assert.Equal(t, uint16(4), totalBatches)

	batchNum, totalBatches, err = rolling.BatchInfo("2|8", 25)
	assert.Nil(t, err)
	assert.Equal(t, uint16(1), batchNum)
	assert.Equal(t, uint16(4), totalBatches)

	batchNum, totalBatches, err = rolling.BatchInfo("3|8", 25)
	assert.Nil(t, err)
	assert.Equal(t, uint16(1), batchNum)
	assert.Equal(t, uint16(4), totalBatches)

	batchNum, totalBatches, err = rolling.BatchInfo("4|8", 25)
	assert.Nil(t, err)
	assert.Equal(t, uint16(2), batchNum)
	assert.Equal(t, uint16(4), totalBatches)

	batchNum, totalBatches, err = rolling.BatchInfo("5|8", 25)
	assert.Nil(t, err)
	assert.Equal(t, uint16(2), batchNum)
	assert.Equal(t, uint16(4), totalBatches)

	batchNum, totalBatches, err = rolling.BatchInfo("6|8", 25)
	assert.Nil(t, err)
	assert.Equal(t, uint16(3), batchNum)
	assert.Equal(t, uint16(4), totalBatches)

	batchNum, totalBatches, err = rolling.BatchInfo("7|8", 25)
	assert.Nil(t, err)
	assert.Equal(t, uint16(3), batchNum)
	assert.Equal(t, uint16(4), totalBatches)
}
