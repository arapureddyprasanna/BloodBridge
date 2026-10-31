from rest_framework import serializers

from .models import Donation


class DonationSerializer(serializers.ModelSerializer):
    donor_name = serializers.CharField(
        source="donor.full_name",
        read_only=True,
    )

    donor_email = serializers.EmailField(
        source="donor.email",
        read_only=True,
    )

    blood_group = serializers.CharField(
        source="blood_request.blood_group",
        read_only=True,
    )

    blood_request_id = serializers.UUIDField(
        source="blood_request.id",
        read_only=True,
    )

    request_urgency = serializers.CharField(
        source="blood_request.urgency",
        read_only=True,
    )

    class Meta:
        model = Donation
        fields = [
            "id",
            "blood_request_id",
            "donor_name",
            "donor_email",
            "blood_group",
            "units_donated",
            "donation_date",
            "status",
            "request_urgency",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "blood_request_id",
            "donor_name",
            "donor_email",
            "blood_group",
            "created_at",
            "updated_at",
        ]