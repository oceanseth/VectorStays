<?php 

    function daysInRange($start, $end, $startLimit, $endLimit) {
        if($start <= $startLimit && $end > $startLimit && $end < $endLimit) {
            return $end->diff($startLimit)->format('%a');
        }
        if ($start >= $startLimit && $start <= $endLimit && $end > $endLimit) {
            return $endLimit->diff($start)->format('%a') + 1;
        }
        if($start >= $startLimit && $end <= $endLimit) {
            return $end->diff($start)->format('%a');
        }
        if ($start < ($startLimit) && $end > ($endLimit)) {
            return $endLimit->diff($startLimit)->format('%a');
        }
        return 0;
    };

    function revInRange($revenue, $start, $end, $startLimit, $endLimit) {
        $start = new \DateTime($start);
        $end = new \DateTime($end);
        $startLimit = new \DateTime($startLimit);
        $endLimit = new \DateTime($endLimit);

        $daysInRange = daysInRange($start, $end, $startLimit, $endLimit);
        $days = intval($end->diff($start)->format('%a'));
        $days = $days > 0 ? $days : 1;

        return $revenue * $daysInRange / $days;
    }

    function renderMoneyString($value)
    {
        return  '$' . number_format($value, 2);
    }

    function getRow($reservation, $revenue, $monthRevenue)
    {
        $fields = array(
            $reservation->firstName . ' ' . $reservation->lastName,
            $reservation->checkIn,
            $reservation->checkOut,
            renderMoneyString($revenue),
            renderMoneyString($monthRevenue)
        );

        return array_reduce($fields, function ($partialHtml, $field) {
            $partialHtml .= "<td>{$field}</td>";
            return $partialHtml;
        }, '<tr>') . '</tr>';
    }

    function renderTable($currentUnit, $revTotal, $ownerPayout, $unitReservationsHtml)
    {
        $ownerPayout = renderMoneyString($ownerPayout);
        $revTotal = renderMoneyString($revTotal);

        echo "
            <div style='page-break-inside: avoid;'>
                <h6><label class='font-weight-bold'>Unit: </label>&nbsp;<span>{$currentUnit}</span></h6>
                <h6><label class='font-weight-bold'>Revenue: </label>&nbsp;<span>{$revTotal}</span></h6>
                <h6><label class='font-weight-bold'>Owner Payout: </label>&nbsp;<span>{$ownerPayout}</span></h6>
                <table class='table mb-5' style='font-size: 0.8rem; white-space:nowrap;'>
                    <thead>
                        <tr>
                            <th style='min-width:15rem;'>Name</th>
                            <th>Check In</th>
                            <th>Check Out</th>
                            <th>Revenue</th>
                            <th>Month Revenue</th>
                        </tr>
                    </thead>
                    <tbody>
                        {$unitReservationsHtml}
                    </tbody>
                </table>
            </div>
        ";
    }

    function getHeader($logo) {
        $curdate = new \DateTime();
        return "<div class='mb-5 w-100 p-1 d-block' style='background-color:#36404A; max-height:70px'>
                    <span>
                        <img src='{$logo}' style='max-height:60px; max-width:100%; padding:0.5rem;'>
                    </span>
                    <p class='text-right text-muted' style='font-size:0.6rem;margin-top:-10px;'>
                        Generated on {$curdate->format('Y-m-d')} at {$curdate->format('H:i')}
                    </p>
                </div>";
    }

    function renderHtml($total, $tablesOutput, $ownerPayout, $logo, $startLimit)
    {
        $header = getHeader($logo);
        $month = (new \DateTime($startLimit))->format('F');
        $total = renderMoneyString($total);
        $ownerPayout = renderMoneyString($ownerPayout);
        echo "{$header}
            <h5><label class='font-weight-bold'>Revenue: </label>&nbsp;<span>{$total}</span></h5>
            <h5><label class='font-weight-bold'>Month: </label>&nbsp;<span>{$month}</span></h5>
            <h5><label class='font-weight-bold'>Owner Payout: </label>&nbsp;<span>{$ownerPayout}</span></h5>
            <hr>";

        echo $tablesOutput;
    }
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="X-UA-Compatible" content="ie=edge">
    <title>Statement</title>
    <link href="<?php echo $bootstrapPath; ?>" rel="stylesheet" type="text/css" />
</head>
<body>
    <div class="container">
        <div class="row">
            <div class="col-sm-12">
                <?php
                    $currentUnit = '';
                    $revTotal = 0;
                    $total = 0;
                    $ownerPayout = '';

                    ob_start();
                    foreach($reservations as $reservation) {
                        if ($currentUnit != $reservation->nickname) {
                            if ($revTotal > 0) {
                                $unitOwnerPayout = $revTotal * (1 - $commission);
                                renderTable($currentUnit, $revTotal, $unitOwnerPayout, $unitReservationsHtml);
                            }
                            $total += $revTotal;
                            $revTotal = 0;
                            $unitReservationsHtml = '';
                            $currentUnit = $reservation->nickname;
                        }

                        $revenue = floatval($reservation->hostPayout) - floatval($reservation->fareCleaning);

                        $monthRevenue = revInRange(floatval($reservation->hostPayout) - floatval($reservation->fareCleaning), 
                            $reservation->checkIn,
                            $reservation->checkOut,
                            $startLimit,
                            $endLimit
                        );

                        $revTotal += $monthRevenue;

                        $rowContent = getRow($reservation, $revenue, $monthRevenue);

                        $unitReservationsHtml .= $rowContent;
                    }

                    $total += $revTotal;
                    $unitOwnerPayout = $revTotal * (1 - $commission);
                    renderTable($currentUnit, $revTotal, $unitOwnerPayout, $unitReservationsHtml);
                    $tablesOutput = ob_get_clean();
                    $ownerPayout = $total * (1 - $commission);
                    renderHtml($total, $tablesOutput, $ownerPayout, $logo, $startLimit);
                ?> 
            </div>
        </div>
    </div>
</body>
</html>