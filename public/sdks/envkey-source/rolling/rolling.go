package rolling

import (
	"errors"
	"math"
	"strconv"
	"strings"
)

// assigns connection a batch for rolling reloads depending on
// connectionNum, totalConnections, and rollingPct

func BatchInfo(socketMsg string, rollingPct uint8) (uint16, uint16, error) {
	// figure out which batch connection is in
	// server sends message in format "connectionNum|totalConnections"
	split := strings.Split(socketMsg, "|")
	connectionNumConv, err := strconv.ParseUint(split[0], 10, 16)
	if err != nil {
		return 0, 0, err
	}
	totalConnectionsConv, err := strconv.ParseUint(split[1], 10, 16)
	if err != nil {
		return 0, 0, err
	}

	connectionNum := uint16(connectionNumConv)
	totalConnections := uint16(totalConnectionsConv)

	prelimBatchSize := uint16(math.Floor((float64(rollingPct) * 0.01) * float64(totalConnections)))
	if prelimBatchSize < 1 {
		prelimBatchSize = 1
	}

	maxBatches := uint16(math.Ceil(100 / float64(rollingPct)))
	totalBatches := uint16(math.Ceil(float64(totalConnections) / float64(prelimBatchSize)))
	if totalBatches > maxBatches {
		totalBatches = maxBatches
	}

	batches := make([]uint16, totalBatches)

	interval := uint16(math.Floor(float64(totalConnections) / float64(totalBatches)))

	numToAssign := totalConnections
	var i uint16 = 0

	for numToAssign > 0 {
		batches[i] += interval
		numToAssign -= interval

		if i == (totalBatches - 1) {
			i = 0
		} else {
			i++
		}
	}

	var current uint16 = 0
	for batchNum, size := range batches {
		current += size

		if connectionNum < current {
			return uint16(batchNum), totalBatches, nil
		}
	}

	return 0, 0, errors.New("error calculating batch info")
}
